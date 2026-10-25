import {it,expect} from 'vitest';
import {appearanceState,themeVariables,glassVariables} from './appearance.js';
it('preserves saved picture/color themes and rejects unsafe or oversized pictures',()=>{const t={id:'example',name:'My theme',background:'#123456',accent:'#ffcc00',image:'data:image/png;base64,AAAA'};expect(appearanceState({selected:t.id,themes:[t]}).themes[0]).toEqual(t);expect(()=>appearanceState({selected:t.id,themes:[{...t,image:'https://example.com/private.jpg'}]})).toThrow();expect(()=>appearanceState({selected:t.id,themes:[{...t,image:'data:image/svg+xml;base64,AAAA'}]})).toThrow();expect(()=>appearanceState({selected:'missing',themes:[t]})).toThrow();expect(()=>appearanceState({selected:null,themes:[t,t]})).toThrow();});
it('keeps the selected RGB colors and provides readable button and text colors',()=>{const v=themeVariables({id:'t',name:'t',background:'#111111',accent:'#ffff00'});expect(v['--bg']).toBe('#111111');expect(v['--accent']).toBe('#ffff00');expect(v['--on-accent']).toBe('#000000');expect(v['--text']).toBe('#f5f5f5');});
it('migrates and validates the saved glass setting',()=>{expect(appearanceState({selected:null,themes:[]}).glassTransparency).toBe(14);expect(appearanceState({selected:null,themes:[],glassTransparency:90}).glassTransparency).toBe(90);for(const glassTransparency of [-1,91,NaN,'25'])expect(()=>appearanceState({selected:null,themes:[],glassTransparency})).toThrow();});
it('reveals progressively more background without increasing blur or changing tone',()=>{
 for(const [surface,text]of [['#ffffff','#202020'],['#151e26','#dbe8f0']]){
  let previous=glassVariables(surface,text,0);const tint=previous['--glass-tint'];
  for(let level=1;level<=90;level++){const value=glassVariables(surface,text,level);
   expect(parseFloat(value['--glass-opacity'])).toBeLessThan(parseFloat(previous['--glass-opacity']));
   expect(value['--glass-tint']).toBe(tint);expect(value['--glass-blur']).toBe('26px');expect(value['--glass-contrast']).toBe('1');expect(value['--glass-brightness']).toBe('1');previous=value;
  }
 }
});
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

it('keeps the material continuous through 35 percent without text backings',()=>{
 const a=glassVariables('#ffffff','#202020',35),b=glassVariables('#ffffff','#202020',36);
 expect(a).not.toHaveProperty('--glass-content');expect(b).not.toHaveProperty('--glass-content');
 expect(Math.abs(Number(a['--glass-contrast'])-Number(b['--glass-contrast']))).toBeLessThan(.02);
 expect(Math.abs(Number(a['--glass-brightness'])-Number(b['--glass-brightness']))).toBeLessThan(.02);
});

it('preserves the original glass material from zero through 35 percent',()=>{for(let level=0;level<=35;level++){const v=glassVariables('#ffffff','#202020',level);expect(v['--glass-blur']).toBe('26px');expect(v['--glass-contrast']).toBe('1');expect(v['--glass-brightness']).toBe('1');}});
