export interface CustomTheme {id:string;name:string;background:string;accent:string;image?:string}
export interface AppearanceState {selected:string|null;themes:CustomTheme[]}
const color=/^#[0-9a-f]{6}$/i;
export function appearanceState(value:unknown):AppearanceState {
 const v=value as Partial<AppearanceState>|null;if(!v||!Array.isArray(v.themes)||v.themes.length>12)throw Error('Invalid custom themes');
 const seen=new Set<string>();const themes=v.themes.map(t=>{if(!t||typeof t.id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(t.id)||seen.has(t.id)||typeof t.name!=='string'||!t.name.trim()||t.name.length>60||!color.test(t.background)||!color.test(t.accent)||t.image!==undefined&&(typeof t.image!=='string'||t.image.length>4200000||!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(t.image)))throw Error('Invalid custom theme');seen.add(t.id);return {id:t.id,name:t.name.trim(),background:t.background,accent:t.accent,...(t.image?{image:t.image}:{})};});
 if(v.selected!==null&&!themes.some(t=>t.id===v.selected))throw Error('Invalid selected theme');return {selected:v.selected??null,themes};
}
function channels(hex:string){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));}
function mix(a:string,b:string,r:number){const c=channels(a),d=channels(b);return '#'+c.map((v,i)=>Math.round(v*(1-r)+d[i]*r).toString(16).padStart(2,'0')).join('');}
function bright(hex:string){return channels(hex).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
export function themeVariables(t:CustomTheme){const dark=bright(t.background)<.22,ink=dark?'#f5f5f5':'#202020',surface=mix(t.background,dark?'#ffffff':'#ffffff',dark?.07:.8);return {'--bg':t.background,'--surface':surface,'--sidebar':surface+'f2','--text':ink,'--muted':mix(t.background,ink,.72),'--line':mix(t.background,ink,.2),'--accent':t.accent,'--accent-light':mix(surface,t.accent,.18),'--hover':mix(surface,t.accent,.1),'--control':mix(surface,t.accent,.07),'--on-accent':bright(t.accent)>.35?'#101010':'#ffffff','--pet-outline':mix(t.accent,'#111111',.5),'--pet-body':mix(t.accent,'#ffffff',.55),'--pet-shine':mix(t.accent,'#ffffff',.82),'--pet-eyes':mix(t.accent,'#111111',.65),'--pet-cheek':'#eab8a7'};}
