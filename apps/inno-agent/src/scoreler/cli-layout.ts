import {stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi} from '@earendil-works/pi-tui';
import type {StudyEvent} from './store.js';

/** Terminal output can contain control sequences from a model or saved event. */
export function plainTerminalText(value: string): string {
 return stripTerminalSequences(value).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

export function eventsForLocalDay(events: StudyEvent[], now: Date): StudyEvent[] {
 const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
 const end = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
 return events.filter(event=>{
  const a=Date.parse(event.start),b=Date.parse(event.end);
  return Number.isFinite(a)&&Number.isFinite(b)&&a<end.getTime()&&b>start.getTime();
 }).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
}

export function calendarLines(events: StudyEvent[], now: Date, locale: 'en'|'zh-CN'): string[] {
 const today=eventsForLocalDay(events,now);
 const heading=locale==='zh-CN'?'今日日程':'Today';
 const date=new Intl.DateTimeFormat(locale,{month:'short',day:'numeric',weekday:'short'}).format(now);
 if(!today.length)return [heading,date,'',locale==='zh-CN'?'今天没有日程':'No events today'];
 const time=new Intl.DateTimeFormat(locale,{hour:'2-digit',minute:'2-digit',hour12:false});
 return [heading,date,'',...today.flatMap(event=>[
  `${time.format(new Date(event.start))}–${time.format(new Date(event.end))}`,
  `${event.completed?'✓ ':''}${plainTerminalText(event.title).replace(/\s+/g,' ')}`,
  ...(event.subject?[plainTerminalText(event.subject).replace(/\s+/g,' ')]:[]),''
 ])];
}

/** Draw the daily pane next to the chat when there is room. At narrow widths it follows chat. */
export function layoutChatAndCalendar(chat: string[],calendar: string[],width: number): string[] {
 const columns=Math.max(1,Math.floor(width));
 if(columns<72)return [...chat.flatMap(line=>wrapTextWithAnsi(plainTerminalText(line),columns)), '', ...calendar.flatMap(line=>wrapTextWithAnsi(plainTerminalText(line),columns))];
 const side=Math.min(28,Math.max(20,Math.floor(columns*.24))),left=columns-side-3;
 const wrap=(lines:string[],size:number)=>lines.flatMap(line=>wrapTextWithAnsi(plainTerminalText(line),size));
 const leftLines=wrap(chat,left),rightLines=wrap(calendar,side),result:string[]=[];
 for(let i=0;i<Math.max(leftLines.length,rightLines.length);i++){
  const l=truncateToWidth(leftLines[i]??'',left,''),r=truncateToWidth(rightLines[i]??'',side,'');
  result.push(l+' '.repeat(Math.max(0,left-visibleWidth(l)))+' │ '+r);
 }
 return result;
}

export type CliCommand = {type:'message';text:string}|{type:'command';name:string;argument:string};
export function parseCliCommand(input:string):CliCommand {
 const text=input.trim();
 if(!text.startsWith('/'))return {type:'message',text};
 const match=/^\/([a-z][a-z-]*)(?:\s+([\s\S]*))?$/i.exec(text);
 if(!match)return {type:'message',text};
 return {type:'command',name:match[1].toLowerCase(),argument:(match[2]??'').trim()};
}
