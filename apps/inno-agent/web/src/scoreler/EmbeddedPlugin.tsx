import {useEffect,useRef,useState} from 'react';
export type ToolboxPlugin={manifest:{id:string;name:string;description:string;version:string};enabled:boolean};
export function EmbeddedPlugin({plugin,locale,notice}:{plugin:ToolboxPlugin;locale:string;notice:(text:string)=>void}){
 const slot=useRef<HTMLDivElement>(null),[ready,setReady]=useState(false);
 useEffect(()=>{
  const api=window.scorelerDesktop?.plugins;if(!api)return;
  const viewId=crypto.randomUUID(),id=plugin.manifest.id;let active=true,opened=false,frame=0;
  const bounds=()=>{const r=slot.current!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.y<80?0:Math.max(0,Math.min(r.height,innerHeight-r.y))};};
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(active&&opened)void api('resize',{id,viewId,bounds:bounds()}).catch(e=>notice(String(e)));});};
  const observer=new ResizeObserver(update);observer.observe(slot.current!);window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
  void api('open',{id,locale,embedded:true,viewId,bounds:bounds()}).then(()=>{opened=true;if(!active)return api('close',{id,viewId});setReady(true);update();}).catch(e=>{if(active)notice(String(e));});
  return()=>{active=false;observer.disconnect();cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);if(opened)void api('close',{id,viewId}).catch(()=>{});};
 },[plugin.manifest.id,locale]);
 return <section className="panel embedded-plugin"><div className="section-heading"><h2>{plugin.manifest.name}</h2><small>{plugin.manifest.version} · {locale==='en'?'Offline plugin':'离线插件'}</small></div><div className="embedded-plugin-slot" ref={slot} aria-label={plugin.manifest.name}>{!ready&&<p role="status">{locale==='en'?'Opening tool…':'正在打开工具…'}</p>}</div></section>;
}
