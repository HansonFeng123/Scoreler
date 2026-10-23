// Countdown scheduling lives in the main process so hidden renderer throttling
// does not delay the Windows notification.
function createTimerNotifications({Notification,icon,showMainWindow,onExpired,now=Date.now,schedule=setTimeout,cancel=clearTimeout}){
 let timer=null,deadline=null,locale='zh-CN',delivered=null;
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 const arm=()=>{clear();if(deadline===null)return;timer=schedule(()=>{
  if(deadline===null)return;if(now()<deadline){arm();return;}
  const finished=deadline;deadline=null;timer=null;if(delivered===finished)return;delivered=finished;
  let notified=false;
  try{if(Notification.isSupported()){const en=locale==='en';const notification=new Notification({title:en?'Scoreler · Time’s up':'Scoreler · 计时结束',body:en?'Your focus session is complete. Take a little break.':'这段专注已完成，休息一下吧。',icon});notification.on('click',showMainWindow);notification.show();notified=true;}}catch{}
  onExpired({deadline:finished,notified});
 },Math.max(0,deadline-now()));};
 return {sync(value){if(!value||!['en','zh-CN'].includes(value.locale)||!(value.deadline===null||Number.isSafeInteger(value.deadline)&&value.deadline>0&&value.deadline<=now()+86400000))throw Error('Invalid countdown state');locale=value.locale;
  if(value.deadline!==null&&value.deadline===delivered)return {supported:Notification.isSupported(),completed:true};
  if(value.deadline!==deadline){deadline=value.deadline;arm();}
  return {supported:Notification.isSupported(),completed:false};
 },dispose(){clear();deadline=null;}};
}
module.exports={createTimerNotifications};
