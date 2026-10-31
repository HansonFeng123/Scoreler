import {describe,expect,it} from 'vitest';
import {visibleWidth} from '@earendil-works/pi-tui';
import {calendarLines,eventsForLocalDay,layoutChatAndCalendar,parseCliCommand} from './cli-layout.js';
import type {StudyEvent} from './store.js';

const event=(id:string,start:Date,end:Date,title='课程'):StudyEvent=>({id,title,subject:'物理',start:start.toISOString(),end:end.toISOString(),kind:'lesson',completed:false});
describe('Scoreler terminal layout',()=>{
 it('includes overnight events crossing today and sorts by start time',()=>{
  const now=new Date(2026,9,27,12),day=(offset:number,hour:number)=>new Date(2026,9,27+offset,hour);
  const rows=[event('later',day(0,14),day(0,15)),event('overnight',day(-1,23),day(0,1)),event('tomorrow',day(1,0),day(1,1))];
  expect(eventsForLocalDay(rows,now).map(e=>e.id)).toEqual(['overnight','later']);
  expect(calendarLines(rows,now,'zh-CN').join(' ')).toContain('课程');
 });
 it('fits wide Chinese text and strips terminal control sequences',()=>{
  const lines=layoutChatAndCalendar(['你好，Scoreler'],['今日日程','\u001b]0;bad\u0007数学课程'],80);
  expect(lines.join('\n')).toContain('数学课程');expect(lines.join('\n')).not.toContain('\u001b');
  expect(lines.every(line=>visibleWidth(line)<=80)).toBe(true);
  expect(layoutChatAndCalendar(['你好'],['日程'],40).join('\n')).toContain('日程');
 });
 it('parses commands while preserving ordinary Chinese messages and paths',()=>{
  expect(parseCliCommand('/reasoning high')).toEqual({type:'command',name:'reasoning',argument:'high'});
  expect(parseCliCommand('/image C:\\我的图片\\题目.png')).toEqual({type:'command',name:'image',argument:'C:\\我的图片\\题目.png'});
  expect(parseCliCommand('解释这个问题')).toEqual({type:'message',text:'解释这个问题'});
 });
});
