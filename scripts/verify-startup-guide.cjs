// Real frontend/backend navigation with an isolated, synthetic profile.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process'),net=require('node:net'),assert=require('node:assert/strict');
const root=p.resolve(__dirname,'..'),runtime=p.join(root,'runtime');
const profile=fs.mkdtempSync(p.join(runtime,'startup-guide-test-')),home=p.join(profile,'study');
app.setPath('userData',profile);app.disableHardwareAcceleration();
let server,win,watchdog,finished=false;const result={isolated:true,aiRequests:0,destinations:{}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function finish(error){if(finished)return;finished=true;clearTimeout(watchdog);if(error)result.error=error.message;result.ok=!error;fs.writeFileSync(p.join(runtime,'startup-guide-result.json'),JSON.stringify(result,null,2));server?.kill();app.exit(error?1:0);}
app.whenReady().then(async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const config=require('../electron/default-config.cjs').defaultConfig('without-free-models');fs.mkdirSync(p.join(home,'config'),{recursive:true});fs.writeFileSync(p.join(home,'config/config.json'),JSON.stringify(config));
 server=cp.spawn(process.execPath,[p.join(root,'apps/inno-agent/dist/server.js'),'--server','--port',String(port),'--home',home,'--data-dir',p.join(home,'data'),'--config-dir',p.join(home,'config'),'--config',p.join(home,'config/config.json'),'--skills-dir',p.join(home,'skills'),'--workspace-dir',p.join(home,'generated')],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',INNO_DESKTOP:'1',SCORELER_FREE_MODELS:'0',INIT_CWD:home},stdio:'ignore',windowsHide:true});
 const base='http://127.0.0.1:'+port;let ready=false;for(let n=0;n<120;n++){try{if((await fetch(base+'/api/health')).ok){ready=true;break;}}catch{}await sleep(250);}assert(ready,'Backend startup');
 for(const channel of ['scoreler-appearance-set','scoreler-companion-get','scoreler-companion-set','scoreler-app-info','scoreler-update-preferences','scoreler-network','scoreler-browser','scoreler-mail-state','scoreler-timer-sync','scoreler-cli'])ipcMain.handle(channel,()=>({saved:true,visible:false,version:'1.4.0',automatic:false,url:'',configured:false,supported:true,installed:false}));
 ipcMain.handle('scoreler-chatgpt',()=>({session:{status:'disconnected'},models:[]}));ipcMain.handle('scoreler-plugins',()=>({available:[],installed:[],catalog:{}}));
 win=new BrowserWindow({show:false,width:1365,height:950,webPreferences:{preload:p.join(root,'electron/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
 const js=code=>win.webContents.executeJavaScript(code);
 const waitFor=async code=>{for(let n=0;n<70;n++){if(await js(code))return;await sleep(100);}throw Error('Navigation failed: '+code);};
 const click=label=>js(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(label)}||b.querySelector('strong')?.textContent===${JSON.stringify(label)});if(!b)throw Error('Missing button');b.click();})()`);
 await win.loadURL(base);await js("localStorage.setItem('scoreler.locale','en')");await win.loadURL(base);await waitFor("!!document.querySelector('.sidebar')");
 for(const topic of ['cli','plugins','chatgpt','proxy','github-proxy']){
  await click('Toolbox');await waitFor("[...document.querySelectorAll('button')].some(b=>b.querySelector('strong')?.textContent==='Startup toolkit')");await click('Startup toolkit');
  await waitFor(`!!document.querySelector('.startup-guide #setup-${topic}')`);
  await js(`document.querySelector('.startup-guide #setup-${topic} button').click()`);
  await waitFor(topic==='plugins'?"!!document.querySelector('.plugins-page')":`!!document.querySelector('.settings-grid #setup-${topic}')`);
  await sleep(250);
  if(topic!=='plugins'){const rect=await js(`(()=>{const r=document.getElementById('setup-${topic}').getBoundingClientRect();return {top:r.top,bottom:r.bottom};})()`);assert(rect.top>=-2&&rect.top<950,'Destination scroll position');}
  result.destinations[topic]=true;
 }
 await finish();
}).catch(finish);
watchdog=setTimeout(()=>finish(Error('Startup guide verification timed out')),60000);
