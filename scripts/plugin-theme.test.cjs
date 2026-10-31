const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {pluginTheme,themeBootstrap,themeUpdate}=require('../electron/plugin-theme.cjs');
test('only allowlisted appearance colors enter plugin context',()=>{
 const input={theme:'dark',palette:'amber',image:'private wallpaper',token:'secret',variables:{'--accent':'#aabbcc','--bg':'url(https://private.test)','--private':'sensitive'}};
 const output=pluginTheme(input),script=themeBootstrap(input);
 assert.equal(output.mode,'dark');assert.equal(output.colors.accent,'#aabbcc');
 assert(!script.includes('private wallpaper'));assert(!script.includes('sensitive'));assert(!script.includes('secret'));assert(!script.includes('https://private.test'));
 assert.equal(pluginTheme({theme:'dark',variables:{'--accent':'#b5a2d0'}}).colors.onAccent,'#000000');
 assert.equal(pluginTheme({variables:{'--accent':'#111111','--on-accent':'#222222'}}).colors.onAccent,'#ffffff');
});
test('theme updates preserve input and use the graph redraw switch',()=>{
 const dom=new JSDOM('<html data-theme="dark"><head></head><body><button id="theme-toggle"></button><textarea>unsent translation</textarea></body></html>',{runScripts:'outside-only'});
 try{const w=dom.window;let redraws=0,changes=0;
 w.document.getElementById('theme-toggle').onclick=()=>{redraws++;w.document.documentElement.dataset.theme=w.document.documentElement.dataset.theme==='dark'?'light':'dark';};
 w.eval(themeBootstrap({theme:'light',palette:'amber'}));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(w.document.documentElement.dataset.theme,'light');assert.equal(redraws,1);
 w.addEventListener('scoreler-theme-change',()=>changes++);
 w.eval(themeUpdate({theme:'dark',variables:{'--accent':'#abcdef','--on-accent':'#000000'}}));
 assert.equal(redraws,2);assert.equal(changes,1);assert.equal(w.__scorelerPluginTheme.mode,'dark');
 assert.equal(w.document.documentElement.style.getPropertyValue('--scoreler-accent'),'#abcdef');
 assert.equal(w.document.querySelector('textarea').value,'unsent translation');
 assert.equal(typeof w.scorelerDesktop,'undefined');assert(Object.isFrozen(w.__scorelerPluginTheme.colors));
 }finally{dom.window.close();}
});
