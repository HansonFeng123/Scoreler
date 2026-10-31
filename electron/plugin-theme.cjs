// Appearance-only contract. Never pass the appearance record itself (it can
// contain a personal wallpaper), credentials, paths, or study content.
function pluginTheme(value={}){
 const dark=value.theme==='dark',accent={sage:'#507c66',ocean:'#397493',lavender:'#79618f',amber:'#926d34'}[value.palette]||'#507c66';
 const defaults=dark?{bg:'#18221d',surface:'#24342b',text:'#eef5f0',muted:'#c5d4ca',line:'#61776a',accent,onAccent:'#ffffff'}:{bg:'#f3f6f2',surface:'#ffffff',text:'#263d31',muted:'#496354',line:'#b8c9be',accent,onAccent:'#ffffff'};
 const keys={bg:'--bg',surface:'--surface',text:'--text',muted:'--muted',line:'--line',accent:'--accent',onAccent:'--on-accent'};
 const colors=Object.fromEntries(Object.entries(keys).map(([name,key])=>[name,/^#[a-f0-9]{6}$/i.test(value.variables?.[key]||'')?value.variables[key]:defaults[name]]));
 const luminance=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
 const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 if(contrast(colors.accent,colors.onAccent)<4.5)colors.onAccent=contrast(colors.accent,'#000000')>contrast(colors.accent,'#ffffff')?'#000000':'#ffffff';
 return {version:1,mode:dark?'dark':'light',colors};
}
function installPluginTheme(initial){
 let theme=Object.freeze({...initial,colors:Object.freeze(initial.colors)});
 Object.defineProperty(window,'__scorelerPluginTheme',{get:()=>theme,configurable:false});
 function apply(next){
  theme=Object.freeze({...next,colors:Object.freeze(next.colors)});
  const root=document.documentElement;
  // Existing graph releases use an internal palette for their WebGL canvas.
  // Use their own switch so curves/grid redraw; CSS alone cannot repaint it.
  const toggle=document.getElementById('theme-toggle');
  if(toggle&&root.dataset.theme!==theme.mode)toggle.click();
  root.dataset.theme=theme.mode;root.style.colorScheme=theme.mode;
  for(const [name,color]of Object.entries(theme.colors))root.style.setProperty('--scoreler-'+name,color);
  let style=document.getElementById('scoreler-host-theme');
  if(!style){style=document.createElement('style');style.id='scoreler-host-theme';document.head.append(style);}
  style.textContent=`
   :root{--page-bg:var(--scoreler-bg)!important;--panel-bg:var(--scoreler-surface)!important;--panel-border:var(--scoreler-line)!important;--text:var(--scoreler-text)!important;--muted:var(--scoreler-muted)!important;--accent:var(--scoreler-accent)!important;--divider:var(--scoreler-line)!important}
   body{background:var(--scoreler-bg)!important;color:var(--scoreler-text)!important}
   button,select,textarea,input{color:var(--scoreler-text)!important;background:var(--scoreler-surface)!important;border-color:var(--scoreler-line)!important;accent-color:var(--scoreler-accent)}
   textarea::placeholder,input::placeholder{color:var(--scoreler-muted)!important;opacity:1}
   .primary{background:var(--scoreler-accent)!important;color:var(--scoreler-onAccent)!important}
   .notice,details,dialog{background:var(--scoreler-surface)!important;color:var(--scoreler-text)!important}
   small{color:var(--scoreler-muted)!important}
   button:focus-visible,select:focus-visible,textarea:focus-visible,input:focus-visible{outline:2px solid var(--scoreler-accent);outline-offset:3px}
  `;
 }
 window.addEventListener('scoreler-host-theme',event=>{apply(event.detail);window.dispatchEvent(new CustomEvent('scoreler-theme-change',{detail:theme}));});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>apply(theme),{once:true});else apply(initial);
}
function themeBootstrap(value){return '('+installPluginTheme.toString()+')('+JSON.stringify(pluginTheme(value))+');';}
function themeUpdate(value){return 'window.dispatchEvent(new CustomEvent("scoreler-host-theme",{detail:'+JSON.stringify(pluginTheme(value))+'}));';}
module.exports={pluginTheme,themeBootstrap,themeUpdate};
