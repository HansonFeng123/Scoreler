import {useEffect,useState} from 'react';
import {Play,Pause,RotateCcw,Timer,Clock3} from 'lucide-react';
import {readClock,listenClock,timerValue,stopwatchValue,startTimer,pauseTimer,resetTimer,toggleStopwatch,resetStopwatch,clockText} from './studyClock.js';
export function TimeTools({en,mode}:{en:boolean;mode:'timer'|'stopwatch'}){
 const [clock,setClock]=useState(readClock),[,tick]=useState(0),[minutes,setMinutes]=useState('25'),[seconds,setSeconds]=useState('0');
 useEffect(()=>listenClock(()=>setClock(readClock())),[]);
 useEffect(()=>{if(clock.deadline===null&&clock.started===null)return;const id=setInterval(()=>tick(n=>n+1),100);return()=>clearInterval(id);},[clock.deadline,clock.started]);
 const timer=mode==='timer',running=timer?clock.deadline!==null:clock.started!==null,ms=timer?timerValue():stopwatchValue();
 const duration=(Number(minutes)*60+Number(seconds))*1000,valid=minutes!==''&&seconds!==''&&Number.isInteger(Number(minutes))&&Number.isInteger(Number(seconds))&&Number(minutes)>=0&&Number(seconds)>=0&&Number(seconds)<60&&duration>0&&duration<=86400000;
 return <section className="panel toolbox-clock"><h2>{timer?<Timer size={22}/>:<Clock3 size={22}/>} {timer?(en?'Countdown timer':'倒计时'):(en?'Stopwatch':'秒表')}</h2><p>{timer?(en?'A little focus, one session at a time.':'专注一小段时间，让进步慢慢发生。'):(en?'Give your practice a rhythm.':'记录每一次练习，找到自己的节奏。')}</p>
  <div className="clock-display" role="timer" aria-label={timer?(en?'Time remaining':'剩余时间'):(en?'Elapsed time':'已用时间')}>{clockText(timer?Math.ceil(ms/1000)*1000:ms,!timer)}</div>
  {timer&&<div className="clock-duration"><label>{en?'Minutes':'分钟'}<input type="number" min="0" max="1440" step="1" disabled={running} value={minutes} onChange={e=>{setMinutes(e.target.value);resetTimer(0);}}/></label><label>{en?'Seconds':'秒'}<input type="number" min="0" max="59" step="1" disabled={running} value={seconds} onChange={e=>{setSeconds(e.target.value);resetTimer(0);}}/></label></div>}
  <div className="button-row"><button className="primary" disabled={timer&&!running&&ms<=0&&!valid} onClick={()=>timer?(running?pauseTimer():startTimer(ms>0?ms:duration)):toggleStopwatch()}>{running?<Pause size={17}/>:<Play size={17}/>} {running?(en?'Pause':'暂停'):(!timer&&ms>0?(en?'Continue':'继续'):(en?'Start':'开始'))}</button><button className="secondary" onClick={()=>timer?resetTimer(valid?duration:0):resetStopwatch()}><RotateCcw size={17}/>{en?'Reset':'重置'}</button></div>
  {timer&&ms===0&&!running&&<p role="status">{en?'Ready for a new session.':'准备好，开始下一段专注。'}</p>}
 </section>;
}
