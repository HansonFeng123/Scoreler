import {useEffect,useState} from 'react';
import {useCustomThemes,saveCustomThemes} from './useCustomThemes.js';
export function GlassTransparency({en,notice}:{en:boolean;notice:(message:string)=>void}){
 const {value,loaded}=useCustomThemes(),[level,setLevel]=useState(value.glassTransparency??14);
 useEffect(()=>setLevel(value.glassTransparency??14),[value.glassTransparency]);
 const save=(next:number)=>{if(next!==(value.glassTransparency??14))void saveCustomThemes({...value,glassTransparency:next}).catch(error=>notice(String(error)));};
 return <section className="glass-transparency"><h3>{en?'Liquid glass':'液态玻璃'}</h3><label>{en?'Glass transparency':'玻璃透明度'} <output>{level}%</output><input aria-label={en?'Glass transparency':'玻璃透明度'} type="range" min="0" max="90" step="1" value={level} disabled={!loaded} onChange={event=>{const next=event.currentTarget.valueAsNumber;setLevel(next);window.dispatchEvent(new CustomEvent('scoreler-glass-preview',{detail:next}));}} onPointerUp={event=>save(event.currentTarget.valueAsNumber)} onKeyUp={event=>save(event.currentTarget.valueAsNumber)} onBlur={event=>save(event.currentTarget.valueAsNumber)}/></label><p className="quiet-note">{en?'0% is solid. Up to 90% reveals more of your background. The blur stays fixed as transparency increases. Saved automatically; form fields stay solid.':'0% 为不透明。最高 90% 可显示更多背景；透明度增加时，模糊效果保持不变。自动保存；输入框保持不透明。'}</p></section>;
}
