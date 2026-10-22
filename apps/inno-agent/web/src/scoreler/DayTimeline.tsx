import {useEffect,useRef,useState} from 'react';
import type {StudyEvent} from '../../../src/scoreler/store.js';
import type {Copy,Locale} from './copy.js';
import {dayBlocks} from './calendarDayLayout.js';
import {localDayKey} from './calendar.js';
export function DayTimeline({day,events,locale,t,onEdit,onAdd}:{day:Date;events:StudyEvent[];locale:Locale;t:Copy;onEdit:(e:StudyEvent)=>void;onAdd:(start:string)=>void}){
 const scroll=useRef<HTMLDivElement>(null);const [now,setNow]=useState(new Date());const blocks=dayBlocks(events,day);const key=localDayKey(day);
 useEffect(()=>{const id=setInterval(()=>setNow(new Date()),60000);return()=>clearInterval(id);},[]);
 useEffect(()=>{const first=blocks[0]?.start;const target=first??(key===localDayKey(new Date())?new Date().getHours()*60:480);if(scroll.current)scroll.current.scrollTop=Math.max(0,Math.floor((target-60)/60)*60)*64/60;},[key]);
 const time=(d:string)=>new Date(d).toLocaleTimeString(locale,{hour:'2-digit',minute:'2-digit',hour12:false});
 const add=(minutes:number)=>{const start=new Date(day);start.setHours(Math.floor(minutes/60),minutes%60,0,0);onAdd(start.toISOString());};
 const current=now.getHours()*60+now.getMinutes();
 return <div className="day-timeline-scroll" ref={scroll} aria-label={locale==='en'?'24-hour day calendar':'24 小时日历'}><div className="day-timeline"><div className="day-hours" aria-hidden="true">{Array.from({length:25},(_,hour)=><span key={hour} style={{top:hour*64}}>{String(hour).padStart(2,'0')}:00</span>)}</div><div className="day-time-track">{Array.from({length:48},(_,slot)=>{const hour=String(Math.floor(slot/2)).padStart(2,'0'),minute=slot%2?'30':'00';return <button type="button" key={slot} className={`day-time-slot ${slot%2?'half':''}`} style={{top:slot*32}} aria-label={`${t.addEvent}: ${key} ${hour}:${minute}`} onClick={()=>add(slot*30)}/>;})}{blocks.map(b=><button type="button" key={b.event.id} className={`day-event ${b.event.kind} ${b.event.completed?'is-completed':''} ${b.end-b.start<25?'compact':''}`} style={{top:b.start*64/60,height:(b.end-b.start)*64/60,left:`calc(${b.column/b.columns*100}% + 4px)`,width:`calc(${100/b.columns}% - 8px)`}} onClick={()=>onEdit(b.event)} title={`${time(b.event.start)}–${time(b.event.end)} · ${b.event.title}`} aria-label={`${b.event.title}, ${time(b.event.start)}–${time(b.event.end)}`}><strong>{b.event.title}</strong><span>{time(b.event.start)}–{time(b.event.end)}{b.event.subject?` · ${b.event.subject}`:''}</span></button>)}{key===localDayKey(now)&&<div className="day-now-line" style={{top:current*64/60}} aria-label={locale==='en'?'Current time':'当前时间'}><i/></div>}</div></div></div>;
}
