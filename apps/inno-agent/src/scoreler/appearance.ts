export interface CustomTheme {id:string;name:string;background:string;accent:string;image?:string}
export interface AppearanceState {selected:string|null;themes:CustomTheme[];glassTransparency?:number}
const color=/^#[0-9a-f]{6}$/i;
export function appearanceState(value:unknown):AppearanceState {
 const v=value as Partial<AppearanceState>|null;if(!v||!Array.isArray(v.themes)||v.themes.length>12)throw Error('Invalid custom themes');
 const seen=new Set<string>();const themes=v.themes.map(t=>{if(!t||typeof t.id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(t.id)||seen.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!color.test(t.background)||!color.test(t.accent)||t.image!==undefined&&(typeof t.image!=='string'||t.image.length>4200000||!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(t.image)))throw Error('Invalid custom theme');seen.add(t.id);return {id:t.id,name:t.name.trim(),background:t.background,accent:t.accent,...(t.image?{image:t.image}:{})};});
 if(v.glassTransparency!==undefined&&(!Number.isInteger(v.glassTransparency)||v.glassTransparency<0||v.glassTransparency>90))throw Error('Invalid glass transparency');
 if(v.selected!==null&&!themes.some(t=>t.id===v.selected))throw Error('Invalid selected theme');return {selected:v.selected??null,themes,glassTransparency:v.glassTransparency??14};
}
function channels(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
function mix(a:string,b:string,r:number){const c=channels(a),d=channels(b);return '#'+c.map((v,i)=>Math.round(v*(1-r)+d[i]*r).toString(16).padStart(2,'0')).join('');}
function bright(hex:string){return channels(hex).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function contrast(a:string,b:string){const x=bright(a),y=bright(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function glassVariables(surface:string,text:string,transparency:number){
 const level=Number.isFinite(transparency)?Math.max(0,Math.min(90,Math.round(transparency))):14;
 const tint=mix(surface,bright(text)>.4?'#000000':'#ffffff',.96);
 return {'--glass-tint':tint,'--glass-opacity':(100-level)+'%','--glass-content':level>35?tint+'f0':'transparent'};
}
export function themeVariables(t:CustomTheme){
 const dark=bright(t.background)<.22,ink=dark?'#f5f5f5':'#202020';
 // An arbitrary photo cannot be sampled reliably everywhere. Anchor the glass
 // tint near black/white, then let a controlled amount of the photo through.
 const surface=mix(t.background,dark?'#101820':'#ffffff',dark?.9:.96);
 let readableAccent=t.accent;
 for(let step=1;contrast(readableAccent,surface)<7&&step<=20;step++)readableAccent=mix(t.accent,ink,step/20);
 return {'--bg':t.background,'--surface':surface,'--sidebar':surface+'e6','--text':ink,'--muted':dark?'#d5dce5':'#414b59','--line':mix(surface,ink,.28),'--accent':t.accent,'--accent-ink':readableAccent,'--accent-light':mix(surface,t.accent,.18),'--hover':mix(surface,t.accent,.1),'--control':mix(surface,t.accent,.04),'--on-accent':contrast(t.accent,'#000000')>=contrast(t.accent,'#ffffff')?'#000000':'#ffffff','--pet-outline':mix(t.accent,'#111111',.5),'--pet-body':mix(t.accent,'#ffffff',.55),'--pet-shine':mix(t.accent,'#ffffff',.82),'--pet-eyes':mix(t.accent,'#111111',.65),'--pet-cheek':'#eab8a7'};
}
