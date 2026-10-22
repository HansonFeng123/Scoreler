import messageHelper from './companion-message.cjs';
import edgeHelper from './companion-edge.cjs';
import reminderHelper from './reminders.cjs';
import {BrowserWindow,ipcMain,screen,Notification} from 'electron';
import {existsSync,readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';import {join,dirname} from 'node:path';import {fileURLToPath} from 'node:url';
import helpers from './companion-state.cjs';
const dir=dirname(fileURLToPath(import.meta.url));
export function createCompanion({home,getMainWindow,getPort,showMainWindow,isQuitting}){
 const file=join(home,'config','companion.json');let prefs;try{prefs=helpers.preferences(JSON.parse(readFileSync(file,'utf8')));}catch{prefs=helpers.preferences();}
 let window=null,expanded=false,summary={overdue:0,next:null},timer=null,drag=null,stopped=false,ready=false;
 let edgeTimer=null,dockHidden=!!prefs.edgeAutoHide,leaveAt=0;
 const log=(event)=>{try{mkdirSync(join(home,'data','log'),{recursive:true});appendFileSync(join(home,'data','log','companion.log'),JSON.stringify({at:new Date().toISOString(),event,enabled:prefs.enabled,expanded})+'\n');}catch{}};
 const deliveredFile=join(home,'config','pet-reminders.json');let delivered;try{delivered=new Set(JSON.parse(readFileSync(deliveredFile,'utf8')));}catch{delivered=new Set();}let lastCheck=Date.now()-30000,reminder=null;
 const persist=()=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(prefs,null,2));};
 const state=()=>({...prefs,expanded,edgeHidden:dockHidden,summary,reminder:reminder&&reminder.expires>Date.now()?reminder:null});
 const emit=()=>{if(window&&!window.isDestroyed())window.webContents.send('scoreler-companion-state',state());};
 const isPet=e=>window&&!window.isDestroyed()&&e.sender===window.webContents;
 const authorized=e=>isPet(e)||(getMainWindow()&&e.sender===getMainWindow().webContents&&e.sender.getURL().startsWith(`http://127.0.0.1:${getPort()}/`));
 function reveal(){if(!window||window.isDestroyed()||!prefs.enabled||!ready||dockHidden)return;if(!window.isVisible())window.showInactive();window.setAlwaysOnTop(true,'screen-saver');window.moveTop();}
 function park(){if(!ready||!prefs.enabled)return;const b=bounds(),area=screen.getDisplayNearestPoint({x:b.x+b.width/2,y:b.y+b.height/2}).workArea;window.setBounds(edgeHelper.tabBounds(b,area,prefs.dockEdge));emit();if(!window.isVisible())window.showInactive();}
 function resize(){if(!ready)return;if(dockHidden){park();return;}window.setBounds(bounds());reveal();}
 function bounds(){const size=expanded?{width:340,height:490}:prefs.style==='toolbar'?{width:330,height:92}:{width:270,height:150};const area=screen.getDisplayNearestPoint(Number.isFinite(prefs.x)?{x:prefs.x,y:prefs.y}:screen.getCursorScreenPoint()).workArea;const b=helpers.clampBounds({x:prefs.x??area.x+area.width-size.width-24,y:prefs.y??area.y+area.height-size.height-35,...size},area);return prefs.edgeAutoHide?edgeHelper.dockBounds(b,area,prefs.dockEdge):b;}
 function watchEdge(){
  if(stopped||!ready||!prefs.enabled||!prefs.edgeAutoHide||drag||!window||window.isDestroyed())return;
  const b=bounds(),area=screen.getDisplayNearestPoint({x:b.x+b.width/2,y:b.y+b.height/2}).workArea,p=screen.getCursorScreenPoint();
  if(dockHidden){if(edgeHelper.atEdge(p,b,area,prefs.dockEdge)){dockHidden=false;leaveAt=0;window.setBounds(b);emit();reveal();}return;}
  if(edgeHelper.inside(p,window.getBounds(),12)){leaveAt=0;return;}
  if(!leaveAt)leaveAt=Date.now();
  if(Date.now()-leaveAt>=350){dockHidden=true;leaveAt=0;park();}
 }
 function create(){if(window&&!window.isDestroyed())return;window=new BrowserWindow({...bounds(),show:false,frame:false,transparent:true,resizable:false,movable:false,maximizable:false,minimizable:false,skipTaskbar:true,alwaysOnTop:true,hasShadow:false,backgroundColor:'#00000000',webPreferences:{preload:join(dir,'companion-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});window.setAlwaysOnTop(true,'screen-saver');window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',e=>e.preventDefault());window.on('close',e=>{if(!isQuitting()){e.preventDefault();prefs.enabled=false;persist();window.hide();}});window.on('show',()=>log('shown'));window.on('hide',()=>log('hidden'));window.webContents.on('render-process-gone',(_event,details)=>log('renderer-'+details.reason));window.once('ready-to-show',()=>{ready=true;emit();if(prefs.enabled){if(dockHidden)park();else reveal();}});window.webContents.once('did-finish-load',()=>emit());void window.loadFile(join(dir,'companion.html'));}
 async function refresh(){if(stopped)return;try{const response=await fetch(`http://127.0.0.1:${getPort()}/api/student/state`,{signal:AbortSignal.timeout(5000)});if(response.ok){const data=await response.json();summary=helpers.summarize(data.events);const now=Date.now();if(data.preferences?.reminders!==false){for(const item of reminderHelper.dueReminders(data.events,now,lastCheck)){if(delivered.has(item.key))continue;delivered.add(item.key);const en=prefs.locale==='en';const title=item.kind==='lesson'?(en?'Class in 5 minutes':'课程将在 5 分钟后开始'):(en?`Homework due in ${item.minutes} minutes`:`作业将在 ${item.minutes} 分钟后截止`);reminder={title,body:item.title,expires:now+120000};log('reminder-'+item.kind+'-'+item.minutes);try{if(Notification.isSupported()){const notification=new Notification({title,body:item.title,icon:join(dir,'scoreler.png')});notification.on('click',()=>showMainWindow());notification.show();}}catch{}mkdirSync(dirname(deliveredFile),{recursive:true});writeFileSync(deliveredFile,JSON.stringify([...delivered].slice(-500)));}}lastCheck=now;emit();}}catch{}}
 function update(patch){const wasEnabled=prefs.enabled;prefs=helpers.preferences({...prefs,...Object.fromEntries(Object.entries(patch??{}).filter(([k])=>['enabled','locale','theme','palette'].includes(k)))});persist();if(prefs.enabled!==wasEnabled){log(prefs.enabled?'enable-request':'hide-request');if(prefs.enabled){dockHidden=false;create();resize();}else window?.hide();}emit();return state();}
 ipcMain.handle('scoreler-companion-get',e=>{if(!authorized(e))throw Error('Unauthorized companion request');return state();});
 ipcMain.handle('scoreler-companion-set',(e,patch)=>{if(!authorized(e))throw Error('Unauthorized companion request');return update(patch);});
 ipcMain.handle('scoreler-companion-expand',(e,value)=>{if(!isPet(e))throw Error('Unauthorized companion request');expanded=!!value;log(expanded?'expand-request':'collapse-request');resize();emit();return state();});
 ipcMain.handle('scoreler-companion-dock',e=>{
  if(!isPet(e))throw Error('Unauthorized companion request');
  prefs.edgeAutoHide=!prefs.edgeAutoHide;
  const b=window.getBounds(),area=screen.getDisplayNearestPoint({x:b.x+b.width/2,y:b.y+b.height/2}).workArea;
  prefs.dockEdge=edgeHelper.nearestEdge(b,area);prefs.x=b.x;prefs.y=b.y;leaveAt=0;
  dockHidden=prefs.edgeAutoHide;persist();resize();emit();return state();
 });
 ipcMain.handle('scoreler-companion-peek',e=>{if(!isPet(e))throw Error('Unauthorized companion request');if(prefs.enabled&&prefs.edgeAutoHide&&dockHidden){dockHidden=false;leaveAt=0;resize();emit();}return state();});
 ipcMain.handle('scoreler-companion-open',e=>{if(!isPet(e))throw Error('Unauthorized companion request');showMainWindow();return true;});
 ipcMain.handle('scoreler-companion-complete',async(e,id)=>{
  if(!isPet(e)||typeof id!=='string'||!id||id.length>200)throw Error('Invalid task');
  const base='http://127.0.0.1:'+getPort();
  const response=await fetch(base+'/api/student/state',{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Unable to load task');
  const data=await response.json(),task=data.events?.find(item=>item.id===id);
  if(!task)throw Error('Task no longer exists');
  const saved=await fetch(base+'/api/student/events',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...task,completed:true}),signal:AbortSignal.timeout(5000)});
  if(!saved.ok)throw Error('Unable to complete task');
  if(reminder?.body===task.title)reminder=null;await refresh();return state();
 });
 ipcMain.handle('scoreler-companion-ask',(e,value)=>{if(!isPet(e))throw Error('Unauthorized companion request');const message=messageHelper.companionMessage(value);showMainWindow();const main=getMainWindow();const send=()=>main.webContents.send('scoreler-companion-prompt',message);if(main.webContents.isLoading())main.webContents.once('did-finish-load',send);else send();expanded=false;resize();emit();return true;});
 ipcMain.on('scoreler-companion-drag',(e,phase)=>{if(!isPet(e))return;if(phase==='start'){drag={cursor:screen.getCursorScreenPoint(),bounds:window.getBounds()};}else if(phase==='move'&&drag){if(prefs.edgeAutoHide){prefs.edgeAutoHide=false;dockHidden=false;emit();}const p=screen.getCursorScreenPoint(),area=screen.getDisplayNearestPoint(p).workArea;window.setBounds(helpers.clampBounds({...drag.bounds,x:drag.bounds.x+p.x-drag.cursor.x,y:drag.bounds.y+p.y-drag.cursor.y},area));}else if(phase==='end'&&drag){const b=window.getBounds();prefs.x=b.x;prefs.y=b.y;drag=null;persist();}});
 return {alert(value){reminder={title:String(value.title).slice(0,200),body:String(value.body).slice(0,500),expires:Date.now()+120000};emit();},start(){stopped=false;if(prefs.enabled)create();void refresh();if(!timer)timer=setInterval(()=>void refresh(),15000);if(!edgeTimer)edgeTimer=setInterval(watchEdge,100);},enabled:()=>prefs.enabled,toggle:()=>update({enabled:!prefs.enabled}),dispose(){stopped=true;clearInterval(timer);clearInterval(edgeTimer);window?.destroy();}};
}

