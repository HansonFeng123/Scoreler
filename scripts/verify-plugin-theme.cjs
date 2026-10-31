// Read installed packages without changing them; Electron uses an isolated
// profile. No model inference, account requests or private text are involved.
const {app,BrowserWindow,WebContentsView,session,protocol}=require('electron');
const fs=require('node:fs'),p=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PluginStore}=require('../electron/plugin-store.cjs');
const {openSandbox,registerScheme}=require('../electron/plugins.cjs');
const {themeUpdate}=require('../electron/plugin-theme.cjs');
const root=p.resolve(__dirname,'..'),runtime=p.join(root,'runtime');
const profile=process.env.SCORELER_PLUGIN_TEST_PROFILE;
if(!profile)throw Error('Set SCORELER_PLUGIN_TEST_PROFILE to a profile with both plugins installed.');
const home=fs.mkdtempSync(p.join(runtime,'plugin-theme-test-'));app.setPath('userData',home);registerScheme(protocol);
let parent,view,watchdog,finished=false;const result={};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function finish(error){if(finished)return;finished=true;clearTimeout(watchdog);if(error){result.error=error.message;result.stack=error.stack;process.exitCode=1;}fs.writeFileSync(p.join(runtime,'plugin-theme-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));view?.close();parent?.destroy();app.exit(error?1:0);}
app.whenReady().then(async()=>{
 const registry=p.join(profile,'toolbox-plugins/installed.json'),before=digest(registry);
 const store=new PluginStore({home:profile,catalogFile:p.join(root,'plugins.json'),appVersion:'1.4.0'});
 parent=new BrowserWindow({show:true,title:"Scoreler plugin theme verification",width:1100,height:850});
 await parent.loadURL('data:text/html,<html><body style="margin:0;background:white">Scoreler plugin appearance verification</body></html>');
 for(const id of ['graphing-calculator','offline-translator']){
  view=await openSandbox({BrowserWindow,session,store,id,locale:'zh-CN',bounds:{x:20,y:90,width:1020,height:680},theme:{theme:'light',palette:'amber',variables:{'--accent':'#926d34'}}});
  await wait(600);view.show();await wait(200);
  if(id==='graphing-calculator')await view.webContents.executeJavaScript("graphVerification.setRows(['y = x^2','y = sin(x)'])");
  else await view.webContents.executeJavaScript("document.getElementById('source').value='Synthetic text retained across theme changes'");
  const probe=()=>view.webContents.executeJavaScript(`({mode:ScorelerPlugin.theme.mode,dataset:document.documentElement.dataset.theme,background:getComputedStyle(document.body).backgroundColor,accent:getComputedStyle(document.documentElement).getPropertyValue('--scoreler-accent').trim(),hasDesktop:typeof scorelerDesktop,hasNode:typeof require,ready:${id==='graphing-calculator'?'!!window.graphVerification?.ready':'!!window.translationVerification?.ready'}})`);
  const light=await probe();assert.equal(light.mode,'light');assert.equal(light.dataset,'light');assert.equal(light.accent,'#926d34');assert(light.ready);assert.equal(light.hasDesktop,'undefined');assert.equal(light.hasNode,'undefined');
  const lightImage=await view.capturePage();assert(!lightImage.isEmpty(),'Light screenshot must contain rendered pixels');fs.writeFileSync(p.join(runtime,id+'-theme-light.png'),lightImage.toPNG());
  await view.webContents.executeJavaScript(themeUpdate({theme:'dark',palette:'lavender',variables:{'--accent':'#b5a2d0'}}));await wait(200);
  const dark=await probe();assert.equal(dark.dataset,'dark');assert.equal(dark.accent,'#b5a2d0');assert.notEqual(light.background,dark.background);
  const retained=await view.webContents.executeJavaScript(id==='graphing-calculator'?"graphVerification.rows().map(r=>r.text).join('|')":"document.getElementById('source').value");
  assert.equal(retained,id==='graphing-calculator'?'y = x^2|y = sin(x)':'Synthetic text retained across theme changes');
  const darkImage=await view.capturePage();assert(!darkImage.isEmpty(),'Dark screenshot must contain rendered pixels');fs.writeFileSync(p.join(runtime,id+'-theme-dark.png'),darkImage.toPNG());
  result[id]={initialLight:true,liveDark:true,accentUpdated:true,inputRetained:true,isolated:true};view.close();view=null;
 }
 assert.equal(digest(registry),before);result.installedRegistryUnchanged=true;await finish();
}).catch(finish);
watchdog=setTimeout(()=>finish(Error('Plugin theme verification timed out')),45000);watchdog.unref();
