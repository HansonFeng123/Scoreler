import {useState} from 'react';
import {calculate} from './arithmetic.js';
export function Calculator({en}:{en:boolean}){
 const [expression,setExpression]=useState(''),[result,setResult]=useState(''),[error,setError]=useState(false);
 const solve=()=>{try{setResult(String(calculate(expression)));setError(false);}catch{setResult(en?'Check your expression (division by zero is not allowed).':'请检查算式，除数不能为零。');setError(true);}};
 const keys=['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','%','+','(',')','⌫','='];
 return <section className="panel toolbox-calculator"><h2>{en?'Calculator':'计算器'}</h2><form onSubmit={e=>{e.preventDefault();solve();}}><label>{en?'Expression':'算式'}<input aria-label={en?'Expression':'算式'} value={expression} maxLength={300} onChange={e=>setExpression(e.target.value)} placeholder="(12 + 8) × 5" autoComplete="off"/></label><output className="calculator-result" aria-live="polite" role={error?'alert':'status'}>{result||'0'}</output><div className="calculator-keys">{keys.map(key=><button type="button" className={key==='='?'primary':'secondary'} key={key} onClick={()=>{if(key==='=')solve();else setExpression(s=>key==='⌫'?s.slice(0,-1):s+key);}}>{key}</button>)}</div><button type="button" className="text-button" onClick={()=>{setExpression('');setResult('');setError(false);}}>{en?'Clear':'清空'}</button></form><p>{en?'Supports parentheses, percentages and keyboard input.':'支持括号、百分数和键盘输入。'}</p></section>;
}

