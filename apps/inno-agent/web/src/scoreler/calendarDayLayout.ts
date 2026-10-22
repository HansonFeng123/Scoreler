import type {StudyEvent} from '../../../src/scoreler/store.js';
import {eventsOnDate} from './calendar.js';
export interface DayBlock {event:StudyEvent;start:number;end:number;column:number;columns:number}
export function dayBlocks(events:StudyEvent[],day:Date):DayBlock[]{
 const midnight=new Date(day);midnight.setHours(0,0,0,0);const tomorrow=new Date(midnight);tomorrow.setDate(tomorrow.getDate()+1);
 const minutes=(d:Date)=>d.getHours()*60+d.getMinutes()+d.getSeconds()/60;
 const blocks=eventsOnDate(events,day).map(event=>{const s=new Date(event.start),e=new Date(event.end);return {event,start:s<midnight?0:minutes(s),end:e>=tomorrow?1440:minutes(e),column:0,columns:1};}).filter(b=>b.end>b.start).sort((a,b)=>a.start-b.start||b.end-a.end);
 let group:DayBlock[]=[],ends:number[]=[],groupEnd=-1;
 const finish=()=>{for(const b of group)b.columns=ends.length;group=[];ends=[];};
 for(const b of blocks){if(b.start>=groupEnd){finish();groupEnd=-1;}let column=ends.findIndex(end=>end<=b.start);if(column<0)column=ends.length;b.column=column;ends[column]=b.end;group.push(b);groupEnd=Math.max(groupEnd,b.end);}finish();return blocks;
}
