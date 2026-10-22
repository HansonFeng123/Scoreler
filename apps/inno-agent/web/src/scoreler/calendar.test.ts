import { describe,it,expect } from 'vitest';
import { calendarDays,shiftCalendar,eventsOnDate,localDayKey } from './calendar.js';
const lesson={id:'lesson',title:'Physics',subject:'physics',kind:'lesson' as const,completed:false,start:new Date(2026,9,19,8).toISOString(),end:new Date(2026,9,19,9).toISOString()};
describe('calendar date selection',()=>{
 it('shows the same future lesson in month, week and day using the selected date',()=>{for(const mode of ['month','week','day'] as const){const days=calendarDays(new Date(2026,9,19),mode);expect(days.flatMap(d=>eventsOnDate([lesson],d))).toHaveLength(1);}});
 it('moves to the following week and preserves a selected date when changing modes',()=>{const date=shiftCalendar(new Date(2026,9,15),'week',1);expect(localDayKey(date)).toBe('2026-10-22');expect(calendarDays(date,'week').map(localDayKey)).toContain('2026-10-19');expect(calendarDays(date,'day').map(localDayKey)).toEqual(['2026-10-22']);});
 it('clamps month navigation at month ends and handles year rollover',()=>{expect(localDayKey(shiftCalendar(new Date(2026,0,31),'month',1))).toBe('2026-02-28');expect(localDayKey(shiftCalendar(new Date(2026,11,31),'day',1))).toBe('2027-01-01');});
 it('includes overnight events on both days and excludes the exact end boundary',()=>{const event={...lesson,start:new Date(2026,9,19,23).toISOString(),end:new Date(2026,9,20,1).toISOString()};expect(eventsOnDate([event],new Date(2026,9,20))).toHaveLength(1);expect(eventsOnDate([{...event,end:new Date(2026,9,20).toISOString()}],new Date(2026,9,20))).toHaveLength(0);});
});
