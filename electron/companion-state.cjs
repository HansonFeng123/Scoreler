const styles=['toolbar','cyber','pixel'];
function clampBounds(bounds,area){const width=Math.min(bounds.width,area.width),height=Math.min(bounds.height,area.height);return {x:Math.round(Math.max(area.x,Math.min(bounds.x,area.x+area.width-width))),y:Math.round(Math.max(area.y,Math.min(bounds.y,area.y+area.height-height))),width,height};}
function preferences(raw={}){return {edgeAutoHide:raw.edgeAutoHide===true,dockEdge:raw.dockEdge==='left'?'left':'right',palette:['ocean','lavender','amber'].includes(raw.palette)?raw.palette:'sage',theme:raw.theme==='dark'?'dark':'light',enabled:typeof raw.enabled==='boolean'?raw.enabled:true,style:'pixel',locale:raw.locale==='en'?'en':'zh-CN',...(Number.isFinite(raw.x)&&Number.isFinite(raw.y)?{x:Math.round(raw.x),y:Math.round(raw.y)}:{})};}
function summarize(events=[],now=Date.now()){
 const date=new Date(now),dayStart=new Date(date.getFullYear(),date.getMonth(),date.getDate()).getTime(),dayEnd=new Date(date.getFullYear(),date.getMonth(),date.getDate()+1).getTime();
 const pending=events.filter(e=>!e.completed&&Number.isFinite(Date.parse(e.start))).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const deadline=e=>['assignment','exam'].includes(e.kind);
 const item=e=>({id:e.id,title:String(e.title??'').slice(0,120),start:e.start,kind:e.kind,overdue:deadline(e)&&Date.parse(e.start)<dayStart});
 const overdue=pending.filter(e=>deadline(e)&&Date.parse(e.start)<now);
 const today=pending.filter(e=>Date.parse(e.start)>=dayStart&&Date.parse(e.start)<dayEnd);
 const homework=today.filter(e=>e.kind==='assignment');
 const schedule=today.filter(e=>!deadline(e)&&Date.parse(e.end||e.start)>now);
 const important=pending.filter(e=>(deadline(e)&&Date.parse(e.start)<dayStart)||(e.kind==='exam'&&Date.parse(e.start)<dayEnd)|| (deadline(e)&&Date.parse(e.start)>=dayEnd&&Date.parse(e.start)<dayEnd+6*86400000));
 const upcoming=pending.filter(e=>Date.parse(e.end||e.start)>now);
 const highlights=[...overdue,...upcoming].filter((e,i,all)=>all.indexOf(e)===i).slice(0,2).map(item);
 return {overdue:overdue.length,next:upcoming[0]?item(upcoming[0]):null,highlights,schedule:schedule.map(item),homework:homework.map(item),important:important.map(item)};
}
module.exports={styles,clampBounds,preferences,summarize};
