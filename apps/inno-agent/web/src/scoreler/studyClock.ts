type Clock={remaining:number;deadline:number|null;elapsed:number;started:number|null};
const key='scoreler.study-clock';
const initial:Clock={remaining:25*60000,deadline:null,elapsed:0,started:null};
let clock:Clock={...initial},alarm:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();
try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Object.keys(initial).every(k=>saved[k]===null||typeof saved[k]==='number'&&Number.isFinite(saved[k])&&saved[k]>=0))clock=saved;}catch{}
function save(){localStorage.setItem(key,JSON.stringify(clock));listeners.forEach(fn=>fn());}
function finish(){clock={...clock,deadline:null,remaining:0};save();window.dispatchEvent(new Event('scoreler-timer-finished'));}
function arm(){clearTimeout(alarm);const deadline=clock.deadline;
 const desktop=window.scorelerDesktop;
 if(desktop?.syncTimer)void desktop.syncTimer({deadline,locale:localStorage.getItem('scoreler.locale')==='en'?'en':'zh-CN'}).then(state=>{if(state.completed&&deadline!==null&&clock.deadline===deadline)finish();}).catch(()=>{});
 if(deadline===null)return;
 alarm=setTimeout(()=>{if(clock.deadline===null)return;if(Date.now()<clock.deadline){arm();return;}finish();
  if(!desktop?.syncTimer&&typeof Notification!=='undefined'&&Notification.permission==='granted'){const en=localStorage.getItem('scoreler.locale')==='en';new Notification(en?'Scoreler · Time’s up':'Scoreler · 计时结束',{body:en?'Your focus session is complete. Take a little break.':'这段专注已完成，休息一下吧。'});}
 },Math.min(2147483647,Math.max(0,deadline-Date.now())));
}
window.scorelerDesktop?.onTimerExpired?.(value=>{if(clock.deadline===value.deadline){clearTimeout(alarm);finish();}});
arm();
export const readClock=()=>clock;
export const listenClock=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function timerValue(now=Date.now()){return clock.deadline===null?clock.remaining:Math.max(0,clock.deadline-now);}
export function stopwatchValue(now=Date.now()){return clock.elapsed+(clock.started===null?0:Math.max(0,now-clock.started));}
export function startTimer(ms:number){if(!Number.isFinite(ms)||ms<=0||ms>86400000)return;clock={...clock,remaining:ms,deadline:Date.now()+ms};save();arm();}
export function pauseTimer(){clock={...clock,remaining:timerValue(),deadline:null};save();arm();}
export function resetTimer(ms=25*60000){clock={...clock,remaining:Math.max(0,Math.min(86400000,ms)),deadline:null};save();arm();}
export function toggleStopwatch(){clock=clock.started===null?{...clock,started:Date.now()}:{...clock,elapsed:stopwatchValue(),started:null};save();}
export function resetStopwatch(){clock={...clock,elapsed:0,started:null};save();}
export function clockText(ms:number,fraction=false){const seconds=Math.floor(Math.max(0,ms)/1000);return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(n=>String(n).padStart(2,'0')).join(':')+(fraction?'.'+Math.floor(Math.max(0,ms)%1000/100):'');}
