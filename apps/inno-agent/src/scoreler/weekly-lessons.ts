import { StudentError, type StudentStore, type StudyEvent } from './store.js';

const dayMs = 86_400_000;

interface WeeklyLessonsRequest {
  title: string;
  sourceWeekStart: string;
  fromDate: string;
  throughDate: string;
  timeZone: string;
  skipDates?: string[];
}

function calendarDate(value: string): number {
  const date = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date) || dateString(date) !== value) {
    throw new StudentError('Use valid calendar dates in YYYY-MM-DD format.');
  }
  return date;
}

function dateString(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

export function repeatWeeklyLessons(store: StudentStore, request: WeeklyLessonsRequest) {
  const source = calendarDate(request.sourceWeekStart);
  const first = calendarDate(request.fromDate);
  const last = calendarDate(request.throughDate);
  if (last < first) throw new StudentError('The end date must be on or after the start date.');
  if (last - first >= 366 * dayMs) throw new StudentError('Repeat up to 366 days per call.');
  const exclusions = new Set((request.skipDates ?? []).map(calendarDate));
  if ([...exclusions].some(date => date < first || date > last)) {
    throw new StudentError('Excluded dates must be inside the requested range.');
  }

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('sv-SE', {
      timeZone: request.timeZone, calendar: 'iso8601', numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
      minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23',
    });
  } catch {
    throw new StudentError('Use a valid time zone such as Asia/Shanghai.');
  }

  // Represent local wall-clock fields on a UTC timeline for date arithmetic.
  const wallTime = (instant: number) => {
    const fields = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    const { year, month, day, hour, minute, second, fractionalSecond } = fields;
    return Date.parse(`${year.padStart(4, '0')}-${month}-${day}T${hour}:${minute}:${second}.${fractionalSecond}Z`);
  };
  const toInstant = (wall: number) => {
    const offsets = new Set([wall - dayMs, wall, wall + dayMs].map(sample => wallTime(sample) - sample));
    const matches = [...offsets].map(offset => wall - offset).filter(candidate => wallTime(candidate) === wall);
    if (matches.length !== 1) {
      throw new StudentError(`A lesson time on ${dateString(wall)} is ambiguous or unavailable in ${request.timeZone}.`);
    }
    return new Date(matches[0]).toISOString();
  };

  return store.transaction(() => {
    const template = store.list<StudyEvent>('events').filter(event => event.kind === 'lesson').flatMap(event => {
      const start = wallTime(Date.parse(event.start));
      const day = Math.floor(start / dayMs) * dayMs;
      if (day < source || day >= source + 7 * dayMs) return [];
      const end = wallTime(Date.parse(event.end));
      if (start === day && end === day + dayMs) {
        throw new StudentError(`The source week has an all-day lesson on ${dateString(day)}. Choose a week with individual lesson times.`);
      }
      return [{ title: event.title, subject: event.subject, weekday: new Date(day).getUTCDay(),
        startOffset: start - day, endOffset: end - day }];
    });
    if (!template.length) throw new StudentError('No saved lessons were found in the source week.');

    const events: Omit<StudyEvent, 'id'>[] = [];
    for (let day = first; day <= last; day += dayMs) {
      if (exclusions.has(day)) continue;
      for (const lesson of template) {
        if (lesson.weekday !== new Date(day).getUTCDay()) continue;
        events.push({
          title: lesson.title, subject: lesson.subject, kind: 'lesson', completed: false,
          start: toInstant(day + lesson.startOffset), end: toInstant(day + lesson.endOffset),
        });
      }
    }
    const saved = events.length ? store.savePlan(request.title, events, { rejectOverlappingLessons: true }) : [];
    return {
      applied: true, fromDate: request.fromDate, throughDate: request.throughDate, timeZone: request.timeZone,
      templateLessons: template.length, created: saved.length, duplicatesSkipped: events.length - saved.length,
      excludedDates: [...exclusions].sort((a, b) => a - b).map(dateString),
    };
  });
}
