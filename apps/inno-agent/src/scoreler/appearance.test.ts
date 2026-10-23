import {it,expect} from 'vitest';
import {appearanceState,themeVariables} from './appearance.js';
it('preserves saved picture/color themes and rejects unsafe or oversized pictures',()=>{const t={id:'example',name:'My theme',background:'#123456',accent:'#ffcc00',image:'data:image/png;base64,AAAA'};expect(appearanceState({selected:t.id,themes:[t]}).themes[0]).toEqual(t);expect(()=>appearanceState({selected:t.id,themes:[{...t,image:'https://example.com/private.jpg'}]})).toThrow();expect(()=>appearanceState({selected:t.id,themes:[{...t,image:'data:image/svg+xml;base64,AAAA'}]})).toThrow();expect(()=>appearanceState({selected:'missing',themes:[t]})).toThrow();expect(()=>appearanceState({selected:null,themes:[t,t]})).toThrow();});
it('keeps the selected RGB colors and provides readable button and text colors',()=>{const v=themeVariables({id:'t',name:'t',background:'#111111',accent:'#ffff00'});expect(v['--bg']).toBe('#111111');expect(v['--accent']).toBe('#ffff00');expect(v['--on-accent']).toBe('#000000');expect(v['--text']).toBe('#f5f5f5');});
it('keeps text readable over glass with bright and dark pictures and extreme accents',()=>{
 const rgb=(h:string)=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 const lum=(c:number[])=>c.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((x,v,i)=>x+v*[.2126,.7152,.0722][i],0);
 const ratio=(a:number[],b:number[])=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const background of ['#000000','#ffffff','#777777','#123456','#f0eecc'])for(const accent of ['#000000','#ffffff','#ffff00','#c06020','#777777']){
  const v=themeVariables({id:'t',name:'t',background,accent});
  expect(ratio(rgb(accent),rgb(v['--on-accent']))).toBeGreaterThanOrEqual(4.5);
  for(const picture of [0,255]){const glass=rgb(v['--surface']).map(n=>n*.86+picture*.14);for(const key of ['--text','--muted','--accent-ink'] as const)expect(ratio(rgb(v[key]),glass)).toBeGreaterThanOrEqual(4.5);}
 }
});
