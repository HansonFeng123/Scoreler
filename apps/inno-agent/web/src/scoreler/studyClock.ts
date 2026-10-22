type Clock={remaining:number;deadline:number|null;elapsed:number;started:number|null};
const key='scoreler.study-clock';
const initial:Clock={remaining:25*60000,deadline:null,elapsed:0,started:null};
let clock:Clock={...initial},alarm:ReturnType<typeof setTimeout>|undefined;
const listeners=new Set<()=>void>();
try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&Object.keys(initial).every(k=>saved[k]===null||typeof saved[k]==='number'&&Number.isFinite(saved[k])&&saved[k]>=0))clock=saved;}catch{}
function save(){localStorage.setItem(key,JSON.stringify(clock));listeners.forEach(fn=>fn());}
function arm(){clearTimeout(alarm);if(clock.deadline!==null)alarm=setTimeout(()=>{
 if(clock.deadline===null)return;if(Date.now()<clock.deadline){arm();return;}
 clock={...clock,deadline:null,remaining:0};save();window.dispatchEvent(new Event('scoreler-timer-finished'));
},Math.min(2147483647,Math.max(0,clock.deadline-Date.now())));}
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
