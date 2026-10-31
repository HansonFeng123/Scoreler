import {it,expect} from 'vitest';
import {stripTerminalSequences,visibleWidth} from '@earendil-works/pi-tui';
import {CliPicker} from './cli-picker.js';
it('navigates choices with arrows and confirms only on Enter',()=>{
 let chosen:string|undefined;const picker=new CliPicker('Choose model',[{value:'a',label:'模型甲'},{value:'b',label:'模型乙'}],'a',choice=>chosen=choice?.value);
 picker.handleInput('\x1b[B');expect(picker.index).toBe(1);expect(chosen).toBeUndefined();picker.handleInput('\r');expect(chosen).toBe('b');
});
it('opens at the current effort, scrolls long lists within bounds, and cancels without applying a change',()=>{
 const results:unknown[]=[];const picker=new CliPicker('Reasoning',Array.from({length:30},(_,i)=>({value:String(i),label:'Option '+i,description:'描述 '.repeat(30)})),'20',choice=>results.push(choice));
 const lines=picker.render(40,12);expect(lines.length).toBeLessThanOrEqual(12);expect(lines.every(line=>visibleWidth(line)<=40)).toBe(true);expect(stripTerminalSequences(lines.join('\n'))).toContain('Option 20');picker.handleInput('\x1b[A');expect(picker.index).toBe(19);picker.handleInput('\x1b');expect(results).toEqual([undefined]);
});

it('handles arrow and Enter arriving in the same terminal chunk',()=>{let chosen='';const picker=new CliPicker('Models',[{value:'a',label:'A'},{value:'b',label:'B'}],'a',choice=>chosen=choice?.value||'');picker.handleInput('\x1b[B\r');expect(chosen).toBe('b');});
