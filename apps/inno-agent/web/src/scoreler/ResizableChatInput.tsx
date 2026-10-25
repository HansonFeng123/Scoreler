import {useRef,useState,type TextareaHTMLAttributes} from 'react';

export function ResizableChatInput({locale,...props}:TextareaHTMLAttributes<HTMLTextAreaElement>&{locale:string}){
  const [height,setHeight]=useState(64);
  const drag=useRef<{y:number;height:number}|null>(null);
  const limit=()=>Math.max(64,Math.min(520,window.innerHeight*.55));
  const resize=(next:number)=>setHeight(Math.max(64,Math.min(limit(),next)));
  const label=locale==='en'?'Drag to resize message box':'拖动调整输入框高度';
  return <div className="resizable-chat-input"><button type="button" className="composer-resize-handle" aria-label={label} title={label} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();drag.current={y:e.clientY,height};e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(drag.current)resize(drag.current.height+drag.current.y-e.clientY);}} onPointerUp={e=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onDoubleClick={()=>setHeight(64)} onKeyDown={e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();resize(height+(e.key==='ArrowUp'?24:-24));}if(e.key==='Home'){e.preventDefault();setHeight(64);}}}><span/></button><textarea {...props} style={{...props.style,height}}/></div>;
}
