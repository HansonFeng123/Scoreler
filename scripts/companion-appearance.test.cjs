const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
test('the desktop pet applies custom theme colors and removes them when returning to a preset',async()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../electron/companion.html'),'utf8'),{runScripts:'outside-only'});let receive;
 const state={palette:'amber',theme:'light',locale:'en',style:'pixel',variables:{'--pet-body':'#ffe0a0','--surface':'#ffffff','--pet-eyes':'#332211'}};
 dom.window.companion={onState:fn=>{receive=fn;},get:async()=>state};dom.window.eval(fs.readFileSync(path.join(__dirname,'../electron/companion-ui.js'),'utf8'));await Promise.resolve();
 const root=dom.window.document.documentElement;assert.equal(root.style.getPropertyValue('--pet-body'),'#ffe0a0');assert.equal(root.dataset.palette,'amber');
 receive({...state,palette:'ocean',variables:{}});assert.equal(root.style.getPropertyValue('--pet-body'),'');assert.equal(root.dataset.palette,'ocean');dom.window.close();
});
