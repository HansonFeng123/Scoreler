import {matchesKey,truncateToWidth} from '@earendil-works/pi-tui';
import {plainTerminalText} from './cli-layout.js';
export type Choice={value:string;label:string;description?:string};
export class CliPicker {
 index:number;private closed=false;
 constructor(public title:string,public options:Choice[],current:string,private finish:(choice:Choice|undefined)=>void){if(!options.length)throw Error('No choices available');this.index=Math.max(0,options.findIndex(item=>item.value===current));}
 handleInput(data:string){
  if(this.closed)return;
  for(const key of data.match(/\x1b\[[0-9;:?]*[A-Za-z~]|\x1bO[A-Za-z]|\x1b.|[\s\S]/g)||[]){this.key(key);if(this.closed)break;}
 }
 private key(data:string){
  if(matchesKey(data,'escape')||matchesKey(data,'ctrl+c')){this.closed=true;this.finish(undefined);return;}
  if(matchesKey(data,'enter')){this.closed=true;this.finish(this.options[this.index]);return;}
  if(matchesKey(data,'up'))this.index=(this.index+this.options.length-1)%this.options.length;
  if(matchesKey(data,'down'))this.index=(this.index+1)%this.options.length;
  if(matchesKey(data,'home'))this.index=0;
  if(matchesKey(data,'end'))this.index=this.options.length-1;
 }
 render(width:number,height:number){
  const count=Math.max(1,Math.floor((height-4)/2)),start=Math.max(0,Math.min(this.index-Math.floor(count/2),this.options.length-count)),lines=[' '+this.title,''];
  for(let i=start;i<Math.min(start+count,this.options.length);i++){
   const chosen=i===this.index,item=this.options[i];
   const color=(text:string)=>chosen?'\x1b[36m'+text+'\x1b[39m':text;
   lines.push(color(truncateToWidth((chosen?' › ':'   ')+plainTerminalText(item.label),width,'…')));
   lines.push(color(truncateToWidth('   '+plainTerminalText(item.description||''),width,'…')));
  }
  lines.push('',truncateToWidth(` ↑/↓ select · Enter confirm · Esc cancel  ${this.index+1}/${this.options.length}`,width,'…'));
  return lines.slice(0,height);
 }
}
