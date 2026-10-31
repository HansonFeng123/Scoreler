import {expect,it} from 'vitest';
import {Editor,TuiAltScreen,stripTerminalSequences,visibleWidth} from '@earendil-works/pi-tui';
import {TerminalView} from './terminal.js';
const identity=(s:string)=>s;
it('renders Chinese chat beside today’s calendar and keeps the editor inside terminal bounds',()=>{
 const terminal={columns:120,rows:32,start(){},stop(){},write(){},hideCursor(){},showCursor(){},setProgress(){},setProgramStatus(){}} as any;
 const tui=new TuiAltScreen(terminal),editor=new Editor(tui,{borderColor:identity,selectList:{selectedPrefix:identity,selectedText:identity,description:identity,scrollInfo:identity,noMatch:identity}});
 const view=new TerminalView(editor,()=>32);view.locale='zh-CN';view.messages=[{role:'You',text:'你好，请解释离子键。'},{role:'Scoreler',text:'离子键是带相反电荷的离子之间的静电吸引。'}];editor.setText('中文输入测试');
 const start=new Date();start.setHours(14,0,0,0);const end=new Date(start.getTime()+3600000);view.events=[{id:'test',title:'物理复习',subject:'Physics',start:start.toISOString(),end:end.toISOString(),kind:'study',completed:false}];
 const lines=view.render(120),plain=stripTerminalSequences(lines.join('\n'));
 expect(plain).toContain('物理复习');expect(plain).toContain('离子键');expect(plain).toContain('中文输入测试');expect(lines.every(line=>visibleWidth(line)<=120)).toBe(true);expect(lines.length).toBeLessThanOrEqual(32);
 view.model='configured/model';view.effort='high';const narrow=view.render(60);expect(stripTerminalSequences(narrow.join('\n'))).toContain('configured/model · high');expect(narrow.every(line=>visibleWidth(line)<=60)).toBe(true);expect(stripTerminalSequences(narrow.join('\n'))).toContain('离子键');
});
it('scrolls a long calendar independently, keeps its heading and clamps both ends',()=>{
 const term={columns:100,rows:24,start(){},stop(){},write(){},hideCursor(){},showCursor(){},setProgress(){},setProgramStatus(){}} as any;
 const tui=new TuiAltScreen(term),editor=new Editor(tui,{borderColor:identity,selectList:{selectedPrefix:identity,selectedText:identity,description:identity,scrollInfo:identity,noMatch:identity}}),view=new TerminalView(editor,()=>24);
 view.messages=[{role:'You',text:'Chat stays here'}];const date=new Date();date.setHours(1,0,0,0);
 view.events=Array.from({length:20},(_,i)=>({id:String(i),title:'Event '+String(i).padStart(2,'0'),subject:'Test',start:new Date(+date+i*60000).toISOString(),end:new Date(+date+(i+1)*60000).toISOString(),kind:'study',completed:false}));
 expect(stripTerminalSequences(view.render(100).join('\n'))).toContain('Event 00');
 const wheel={type:'wheel',button:'none',x:99,y:8,width:100,height:24,screenX:99,screenY:8,shift:false,alt:false,ctrl:false,wheelDelta:4} as const;
 expect(view.handleMouse(wheel)?.handled).toBe(true);expect(view.calendarScroll).toBe(4);expect(view.scroll).toBe(0);
 view.calendarScroll=10000;const bottom=stripTerminalSequences(view.render(100).join('\n'));expect(bottom).toContain('Event 19');expect(bottom).toContain('Today');expect(bottom).toContain('Chat stays here');expect(bottom).not.toContain('Event 00');
 view.calendarScroll=-100;view.render(100);expect(view.calendarScroll).toBe(0);
});
it('routes terminal wheel input to the calendar without losing editor focus',async()=>{
 let input:(data:string)=>void=()=>{};
 const terminal={columns:100,rows:24,kittyProtocolActive:false,start(onInput:(data:string)=>void){input=onInput;},stop(){},drainInput:async()=>{},write(){},hideCursor(){},showCursor(){},setProgress(){},setProgramStatus(){},clearScreen(){},clearFromCursor(){},clearLine(){},moveBy(){}} as any;
 const tui=new TuiAltScreen(terminal,true,undefined,{mouse:true}),editor=new Editor(tui,{borderColor:identity,selectList:{selectedPrefix:identity,selectedText:identity,description:identity,scrollInfo:identity,noMatch:identity}}),view=new TerminalView(editor,()=>24);
 const start=new Date();start.setHours(1,0,0,0);view.events=Array.from({length:20},(_,i)=>({id:String(i),title:'Agenda '+i,subject:'Test',start:new Date(+start+i*60000).toISOString(),end:new Date(+start+(i+1)*60000).toISOString(),kind:'study',completed:false}));
 tui.setLayoutRoot(view);tui.setFocus(editor);tui.start();
 try{await new Promise(r=>setTimeout(r,50));input('\x1b[<65;99;8M');await new Promise(r=>setTimeout(r,50));expect(view.calendarScroll).toBeGreaterThan(0);expect(view.scroll).toBe(0);input('中文');expect(editor.getText()).toBe('中文');}finally{tui.stop();}
});
