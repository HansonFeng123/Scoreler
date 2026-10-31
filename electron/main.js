import {WebContentsView} from 'electron';
import pluginNetworkTransport from './plugin-network.cjs';
import {randomUUID} from 'node:crypto';
import {createNetworkPreferences} from './network-preferences.js';
import {createChatGPTIntegration} from './chatgpt.js';
import appearanceHelper from './appearance.cjs';
import runtimeBootstrap from '../scripts/runtime-bootstrap.cjs';
import windowsShortcut from './windows-shortcut.cjs';
import timerNotifications from './timer-notifications.cjs';
import updateDependencies from '../scripts/update-dependencies.cjs';
import updateState from './update-state.cjs';
// A detached launcher may close its output pipe while the app is running.
for(const stream of [process.stdout,process.stderr])stream?.on('error',error=>{if(error.code!=='EPIPE')throw error;});
import githubUpdates from './github-updates.cjs';
import pluginsHost from './plugins.cjs';
import terminalHost from './cli-bridge.cjs';
import terminalInstall from './cli-install.cjs';
import distributionDefaults from './default-config.cjs';
import {setupMail} from './mail-integration.js';
import {setupStudyBrowser} from './study-browser.js';
import { randomBytes } from 'node:crypto';
import {createCompanion} from './companion.js';
import { app, BrowserWindow, Tray, Menu, shell, dialog, clipboard, nativeImage, ipcMain, screen, Notification, safeStorage, net, session, protocol } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn, execFile, execFileSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { basename, join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

if (process.env.SCORELER_SMOKE_DIR) {
  app.disableHardwareAcceleration();
  const profile=process.argv.find(arg=>arg.startsWith('--scoreler-profile='))?.slice('--scoreler-profile='.length)||join(process.env.SCORELER_HOME,"electron-profile"); mkdirSync(profile,{recursive:true}); app.setPath("userData",profile);
}
const explicitProfile=process.argv.find(arg=>arg.startsWith('--scoreler-profile='))?.slice('--scoreler-profile='.length);
if(!process.env.SCORELER_SMOKE_DIR)app.setPath('userData',explicitProfile||join(app.getPath('appData'),'scoreler-desktop'));
githubUpdates.setProfile(app.getPath('userData'));
pluginsHost.registerScheme(protocol);
const hasInstanceLock=app.requestSingleInstanceLock();
if(!hasInstanceLock)app.exit(0);
try{if(!process.env.SCORELER_PREVIEW)updateState.activatePending(app.getPath('userData'));}catch{dialog.showErrorBox('Scoreler update','The automatic backup failed. The previous version remains selected.');}
const ready=updateState.read(join(app.getPath('userData'),'updates','ready.json'));
const managedRoot=updateState.selectedCandidate(app.getPath('userData'),ready,app.getAppPath());
if(!process.env.SCORELER_PREVIEW&&managedRoot&&managedRoot.toLowerCase()!==app.getAppPath().toLowerCase()){
 app.releaseSingleInstanceLock();const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(join(managedRoot,'node_modules/electron/dist/electron.exe'),[managedRoot,'--scoreler-profile='+app.getPath('userData')],{cwd:managedRoot,env,detached:true,stdio:'ignore',windowsHide:true});child.unref();app.exit(0);
}
app.on('second-instance',()=>showMainWindow());

// macOS 上避免未签名 app 触发钥匙串权限弹窗
// OS-backed credential protection is required for ChatGPT sign-in.

const __dirname = dirname(fileURLToPath(import.meta.url));
let scorelerIcon = join(__dirname,process.platform==='win32'?"scoreler.ico":"scoreler.png");
const scorelerAppId=process.env.SCORELER_PREVIEW?"com.scoreler.desktop.preview":"com.scoreler.desktop";
app.setName("Scoreler");
app.setAppUserModelId(scorelerAppId);

// Older source updaters launch electron.exe directly. Repair at the candidate's
// first launch as well, so upgrading from those releases needs no manual patch.
const profileUpdates=join(app.getPath('userData'),'updates')+'\\';
if(process.platform==='win32'&&app.getAppPath().toLowerCase().startsWith(profileUpdates.toLowerCase())){
 runtimeBootstrap.installRuntimeBootstrap(app.getAppPath(),app.getPath('userData'));
 const branded=join(app.getAppPath(),'node_modules/electron/dist/Scoreler.exe');
 if(basename(process.execPath).toLowerCase()==='electron.exe'&&existsSync(branded)){
  app.releaseSingleInstanceLock();const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(branded,['--scoreler-profile='+app.getPath('userData')],{cwd:app.getAppPath(),env,detached:true,stdio:'ignore',windowsHide:true});
  child.once('error',()=>{dialog.showErrorBox('Scoreler','Could not start the Scoreler runtime. Your study profile is unchanged.');app.exit(1);});
  child.once('spawn',()=>{child.unref();app.exit(0);});
  await new Promise(()=>{});
 }
}

// ── 路径 ─────────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const serverScript = isDev
  ? join(__dirname, "../apps/inno-agent/dist/server.js")
  : join(app.getAppPath(), "apps/inno-agent/dist/server.js");

const explicitHome = process.argv.find(arg => arg.startsWith('--scoreler-home='))?.slice('--scoreler-home='.length);
// Keep testing and packaged launches on the same data home, regardless of app name.
const innoHome = explicitHome || process.env.SCORELER_HOME || join(app.getPath("userData"), "study");
const desktopToken = randomBytes(32).toString("hex");
const serverInstance = randomBytes(16).toString("hex");
const appearanceStore=appearanceHelper.createAppearanceStore(innoHome,nativeImage);
if(existsSync(appearanceStore.icon))scorelerIcon=appearanceStore.icon;
function repairAppShortcut(){
 if(process.platform!=='win32'||process.env.SCORELER_SMOKE_DIR||app.getPath('userData')!==join(app.getPath('appData'),'scoreler-desktop'))return;
 const options={shell,appData:app.getPath('appData'),profile:app.getPath('userData'),executable:process.execPath,installed:join(process.env.LOCALAPPDATA||app.getPath('home'),'Programs','Scoreler','Scoreler.exe'),root:app.getAppPath(),icon:scorelerIcon};
 if(process.env.SCORELER_PREVIEW)windowsShortcut.repairPreviewShortcut(options);
 else if(!process.env.SCORELER_TEST_NO_SHELL_REGISTRATION)windowsShortcut.repairWindowsShortcut(options);
}

const configDir = join(innoHome, "config");
const configPath = join(configDir, "config.json");

const DEFAULT_PORT = 3000;
let serverPort = DEFAULT_PORT;

// ── 首次启动创建默认配置（不要求 API Key） ────────────────────────────────────
function ensureConfig() {
  if (existsSync(configPath)) return;
  mkdirSync(configDir, { recursive: true });
  const edition = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')).scorelerEdition ?? 'without-free-models';
  const defaults = distributionDefaults.defaultConfig(edition, DEFAULT_PORT);
  writeFileSync(configPath, JSON.stringify(defaults, null, 2) + "\n", { mode: 0o600 });
}

// ── 全局状态 ──────────────────────────────────────────────────────────────────
let mainWindow = null;
function validateUpdateSender(event){if(!mainWindow||event.sender!==mainWindow.webContents||new URL(event.sender.getURL()).origin!==`http://127.0.0.1:${serverPort}`)throw Error('Invalid update caller');}
ipcMain.handle('scoreler-app-info',event=>{validateUpdateSender(event);const meta=JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8'));let commit=meta.scorelerSourceCommit||'';try{commit=JSON.parse(readFileSync(join(app.getAppPath(),'update-origin.json'),'utf8')).commit;}catch{}if(!commit&&!app.isPackaged)try{commit=execFileSync('git',['rev-parse','HEAD'],{cwd:app.getAppPath(),encoding:'utf8',windowsHide:true}).trim();}catch{}return {version:meta.version,commit};});
ipcMain.handle('scoreler-source-update-check',async event=>{validateUpdateSender(event);const target=await githubUpdates.latest();let version;try{version=await githubUpdates.version(target);const dir=join(app.getPath('userData'),'updates');mkdirSync(dir,{recursive:true});const versions=updateState.read(join(dir,'versions.json'),{});writeFileSync(join(dir,'versions.json'),JSON.stringify({...versions,[target]:version}));}catch{}const meta=JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8'));let current=meta.scorelerSourceCommit||'';try{current=JSON.parse(readFileSync(join(app.getAppPath(),'update-origin.json'),'utf8')).commit;}catch{}if(!current&&!app.isPackaged)try{current=execFileSync('git',['rev-parse','HEAD'],{cwd:app.getAppPath(),encoding:'utf8',windowsHide:true}).trim();}catch{}if(target!==current&&updatePreferences().automatic){const pending=updateState.read(join(app.getPath('userData'),'updates','pending.json'));if(pending?.commit!==target)startDesktopUpdate(target,'prepare');}return {available:target!==current,target,version,commitsBehind:target===current?0:1};});
function updatePreferences(){return {automatic:false,useProxy:false,...updateState.read(join(app.getPath('userData'),'updates','preferences.json'),{})};}
function updateStatus(){const base=join(app.getPath('userData'),'updates'),status=updateState.read(join(base,'status.json'),{state:'idle'});const versions=updateState.read(join(base,'versions.json'),{});if(status.target){status.targetVersion=versions[status.target];if(!status.targetVersion)try{status.targetVersion=JSON.parse(readFileSync(join(base,'source-'+status.target,'package.json'),'utf8')).version;}catch{}}if(!['idle','pending','failed'].includes(status.state)&&!updateDependencies.activeWorker(base))return {...status,state:'failed',detail:'Update preparation stopped. Check for updates to retry.'};return status;}
function startDesktopUpdate(target,mode){
 const dir=join(app.getPath('userData'),'updates');mkdirSync(dir,{recursive:true});if(updateDependencies.activeWorker(dir))return {started:false,phase:'preparing'};
 writeFileSync(join(dir,'update-dependencies.cjs'),readFileSync(join(app.getAppPath(),'scripts','update-dependencies.cjs')));
 writeFileSync(join(dir,'github-updates.cjs'),readFileSync(join(app.getAppPath(),'electron','github-updates.cjs')));
 const helper=join(dir,'desktop-updater.cjs');writeFileSync(helper,readFileSync(join(app.getAppPath(),'scripts','desktop-updater.cjs')));
 writeFileSync(join(dir,'status.json'),JSON.stringify({state:mode==='activate'?'restarting':'downloading',target,time:new Date().toISOString()}));
 const child=spawn(process.execPath,[helper,app.getPath('userData'),target,String(process.pid),mode,process.execPath,app.getAppPath().endsWith('.asar')?'':app.getAppPath()],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',SCORELER_ELECTRON_DIST:process.env.SCORELER_ELECTRON_DIST||(!app.isPackaged?dirname(process.execPath):'')},windowsHide:true,detached:true,stdio:'ignore'});writeFileSync(join(dir,'worker.json'),JSON.stringify({pid:child.pid}));child.once('error',()=>{writeFileSync(join(dir,'status.json'),JSON.stringify({state:'failed',target,detail:'Could not start the background updater.',time:new Date().toISOString()}));try{unlinkSync(join(dir,'worker.json'));}catch{}});child.unref();return {started:true,phase:mode==='activate'?'restarting':'preparing'};
}
async function prepareAutomaticUpdate(){if(!updatePreferences().automatic||process.env.SCORELER_SMOKE_DIR||process.env.SCORELER_PREVIEW)return;try{const target=await githubUpdates.latest();const pending=updateState.read(join(app.getPath('userData'),'updates','pending.json'));const origin=updateState.read(join(app.getAppPath(),'update-origin.json'));const current=origin?.commit||JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8')).scorelerSourceCommit||execFileSync('git',['rev-parse','HEAD'],{cwd:app.getAppPath(),encoding:'utf8',windowsHide:true}).trim();if(target!==current&&pending?.commit!==target)startDesktopUpdate(target,'prepare');}catch{}}
ipcMain.handle('scoreler-update-preferences',(event,patch)=>{validateUpdateSender(event);if(patch!==undefined){if(!patch||Object.keys(patch).some(k=>!['automatic','useProxy'].includes(k)||typeof patch[k]!=='boolean'))throw Error('Invalid update preference');const dir=join(app.getPath('userData'),'updates');mkdirSync(dir,{recursive:true});writeFileSync(join(dir,'preferences.json'),JSON.stringify({...updatePreferences(),...patch}));if(patch.automatic)void prepareAutomaticUpdate();}return {...updatePreferences(),...updateStatus()};});
ipcMain.handle('scoreler-source-update-apply',async(event,target)=>{
 validateUpdateSender(event);if(typeof target!=='string'||!/^[a-f0-9]{40}$/.test(target))throw Error('Check updates before applying.');
 const pending=updateState.read(join(app.getPath('userData'),'updates','pending.json'));
 if(pending?.commit===target&&updateState.validCandidate(app.getPath('userData'),pending)){const result=startDesktopUpdate(target,'activate');if(result.started)setTimeout(()=>{isQuitting=true;app.quit();},500);return result;}
 return startDesktopUpdate(target,'prepare');
});
let loadingWindow = null;
let serverProcess = null;
const network=createNetworkPreferences({app,session});
ipcMain.handle('scoreler-network',async(event,action,value)=>{validateUpdateSender(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Invalid network caller');try{return await network.action(action,value);}catch{throw Error('Could not apply proxy settings. Check the address and connection.');}});
const chatgpt=createChatGPTIntegration({app,safeStorage,shell,dialog,getWindow:()=>mainWindow,fetch:network.fetch});
const terminalInstaller=terminalInstall.createCliInstall({profile:app.getPath('userData'),root:app.getAppPath(),executable:process.execPath,version:JSON.parse(readFileSync(join(app.getAppPath(),'package.json'),'utf8')).version,preview:!!process.env.SCORELER_PREVIEW});
let terminalBridge;
async function startTerminalBridge(){
 if(terminalBridge||!terminalInstaller.state().installed&&!process.env.SCORELER_CLI_TEST)return;
 const request=async(path,method='GET',value,signal,stream=false)=>{
  const response=await fetch(`http://127.0.0.1:${serverPort}`+path,{method,signal,headers:{'Content-Type':'application/json','x-scoreler-desktop-token':desktopToken},...(value===undefined?{}:{body:JSON.stringify(value)})});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Scoreler request failed (HTTP '+response.status+')');}
  return stream?response:response.json();
 };
 terminalBridge=await terminalHost.createCliBridge({profile:app.getPath('userData'),dispatch:terminalHost.createCliDispatcher({request,chatgpt,version:terminalInstaller.state().version,getLocale:()=>appearanceStore.read()?.locale})});
}
ipcMain.handle('scoreler-cli',async(event,action)=>{
 validateUpdateSender(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Invalid terminal caller');
 if(action==='state')return terminalInstaller.state();
 if(action==='install'){const value=terminalInstaller.install();await startTerminalBridge();return value;}
 if(action==='uninstall'){terminalBridge?.close();terminalBridge=null;return terminalInstaller.uninstall();}
 throw Error('Invalid terminal action');
});
app.on('before-quit',()=>terminalBridge?.close());
try{terminalInstaller.sync();}catch{}
ipcMain.handle('scoreler-chatgpt',async(event,action,value)=>{validateUpdateSender(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Invalid authentication caller');try{return await chatgpt.action(action,value);}catch(error){throw Error(error?.name==='ChatGPTError'?error.message:'ChatGPT operation failed. Check permission and OS credential protection, then try again.');}});
let pluginNetwork;
const pluginFetch=async(url,init)=>{const proxy=await network.action('state'),use=updatePreferences().useProxy&&proxy.url,key=use||'system';if(updatePreferences().useProxy&&!proxy.url)throw Error('Save a proxy address in Connection settings before using it for plugin downloads.');if(use)return pluginNetworkTransport.createCurlFetch(use)(url,init);if(!pluginNetwork||pluginNetwork.key!==key){const connection=session.fromPartition('scoreler-plugin-download-'+randomUUID(),{cache:false});await connection.setProxy(use?{mode:'fixed_servers',proxyRules:use,proxyBypassRules:'localhost;127.0.0.1;[::1]'}:{mode:'system'});connection.setPermissionRequestHandler((_c,_p,done)=>done(false));pluginNetwork={key,connection};}return use?pluginNetworkTransport.createCurlFetch(use)(url,init):pluginNetwork.connection.fetch(url,{...init,credentials:'omit'});};
const plugins=pluginsHost.createPlugins({app,BrowserWindow,WebContentsView,session,dialog,getWindow:()=>mainWindow,fetcher:pluginFetch,getTheme:()=>appearanceStore.read()});
ipcMain.handle('scoreler-plugins',async(event,action,value)=>{validateUpdateSender(event);if(event.senderFrame!==mainWindow.webContents.mainFrame)throw Error('Invalid plugin caller');return plugins.action(action,value);});
let tray = null;
let isQuitting = false;
const companion=createCompanion({getAppearance:()=>appearanceStore.read(),home:innoHome,getMainWindow:()=>mainWindow,getPort:()=>serverPort,showMainWindow:()=>showMainWindow(),isQuitting:()=>isQuitting});
let mailIntegration=null,studyBrowser=null;
ipcMain.on('scoreler-loading-appearance',event=>{event.returnValue=event.sender===loadingWindow?.webContents?appearanceStore.snapshot():{};});
ipcMain.handle('scoreler-appearance-set',(event,value)=>{validateUpdateSender(event);let png;if(value?.icon!==undefined){if(typeof value.icon!=='string'||value.icon.length>400000||!/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(value.icon))throw Error('Invalid app icon');const image=nativeImage.createFromDataURL(value.icon);if(image.isEmpty()||image.getSize().width!==256||image.getSize().height!==256)throw Error('Invalid app icon size');png=image.toPNG();}
 appearanceStore.save(value,png);plugins.refreshTheme();companion.refreshAppearance();if(png){scorelerIcon=appearanceStore.icon;mainWindow?.setIcon(scorelerIcon);tray?.setImage(nativeImage.createFromPath(appearanceStore.png).resize({width:20,height:20}));if(process.platform==='win32'&&mainWindow){const installed=join(process.env.LOCALAPPDATA||app.getPath('home'),'Programs','Scoreler','Scoreler.exe');mainWindow.setAppDetails({appId:scorelerAppId,appIconPath:scorelerIcon,appIconIndex:0,relaunchDisplayName:'Scoreler',relaunchCommand:!process.env.SCORELER_PREVIEW&&existsSync(installed)?'"'+installed+'"':'"'+process.execPath+'" "'+app.getAppPath()+'" --scoreler-profile="'+app.getPath('userData')+'"'});mainWindow.setIcon(scorelerIcon);try{repairAppShortcut();}catch{}}}return {saved:true};});

// Native Windows toast support can register a Start-menu shortcut as a side
// effect. Isolated smoke tests must not register their temporary executable.
const timerNotificationAPI=process.env.SCORELER_SMOKE_DIR||process.env.SCORELER_TEST_NO_SHELL_REGISTRATION?{isSupported:()=>false}:Notification;
const countdownNotifications=timerNotifications.createTimerNotifications({Notification:timerNotificationAPI,icon:scorelerIcon,showMainWindow:()=>showMainWindow(),onExpired:value=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('scoreler-timer-expired',value);}});
ipcMain.handle('scoreler-timer-sync',(event,value)=>{validateUpdateSender(event);return countdownNotifications.sync(value);});
let isCloseDialogOpen = false;
let closeDialogCopy = {
  title: "关闭 Scoreler",
  message: "要如何关闭 Scoreler？",
  detail: "选择“关闭窗口”会让应用继续在后台运行；选择“退出应用”会停止后台服务。勾选“记住我的选择”后，下次将直接使用该选择，也可以在设置 > 通用中修改。",
  buttons: {
    hide: "关闭窗口",
    quit: "退出应用",
    cancel: "取消",
  },
  remember: "记住我的选择",
};

function isCloseDialogCopy(value) {
  if (!value || typeof value !== "object") return false;
  const copy = value;
  const buttons = copy.buttons;
  return typeof copy.title === "string"
    && typeof copy.message === "string"
    && typeof copy.detail === "string"
    && typeof copy.remember === "string"
    && buttons
    && typeof buttons === "object"
    && typeof buttons.hide === "string"
    && typeof buttons.quit === "string"
    && typeof buttons.cancel === "string";
}

ipcMain.handle("scoreler-select-drawing-save-path",async(event,name)=>{
 if(!mainWindow||event.sender!==mainWindow.webContents||!event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`))throw new Error("Unauthorized save request");
 const selected=await dialog.showSaveDialog(mainWindow,{title:"Save drawing note / 保存绘图笔记",defaultPath:String(name||'Note').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)+'.scoreler-drawing',filters:[{name:'Scoreler drawing',extensions:['scoreler-drawing']}]});if(selected.canceled||!selected.filePath)return null;
 const response=await fetch(`http://127.0.0.1:${serverPort}/api/student/folders/authorize`,{method:'POST',headers:{'Content-Type':'application/json','x-scoreler-desktop-token':desktopToken},body:JSON.stringify({path:dirname(selected.filePath)})});if(!response.ok)throw new Error('Unable to authorize save folder');const folder=await response.json();return {folderId:folder.id,path:basename(selected.filePath),exists:existsSync(selected.filePath)};
});
ipcMain.handle("scoreler-copy-drawing-image",(event,data)=>{
 if(!mainWindow||event.sender!==mainWindow.webContents||!event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`))throw new Error("Unauthorized clipboard request");
 if(typeof data!=="string"||data.length>15000000||!data.startsWith('data:image/jpeg;base64,'))throw new Error("Invalid image");
 const image=nativeImage.createFromDataURL(data);if(image.isEmpty())throw new Error("Invalid image");clipboard.writeImage(image);return true;
});
ipcMain.handle("scoreler-save-study-export",async(event,paper)=>{
 if(!mainWindow||event.sender!==mainWindow.webContents||!event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`))throw new Error('Unauthorized export request');
 if(!['pdf','png','docx'].includes(paper?.format)||typeof paper.title!=='string'||typeof paper.html!=='string'||paper.html.length>10000000)throw new Error('Invalid export');
 const selected=await dialog.showSaveDialog(mainWindow,{title:'Export / 导出',defaultPath:paper.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)+'.'+paper.format,filters:[{name:paper.format.toUpperCase(),extensions:[paper.format]}]});if(selected.canceled||!selected.filePath)return false;
 if(paper.format==='docx'){if(typeof paper.data!=='string'||paper.data.length>30000000)throw new Error('Invalid Word document');const data=Buffer.from(paper.data,'base64');if(data[0]!==80||data[1]!==75)throw new Error('Invalid Word document');writeFileSync(selected.filePath,data);return true;}
 const temporary=join(app.getPath('temp'),'scoreler-export-'+randomBytes(12).toString('hex')+'.html');const output=new BrowserWindow({show:false,width:794,height:1123,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});
 try{const security=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src http://127.0.0.1:${serverPort} data:; img-src data: http://127.0.0.1:${serverPort}; script-src 'none'">`;writeFileSync(temporary,paper.html.replace('<head>','<head>'+security));await output.loadFile(temporary);await output.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(image=>image.decode())])');if(paper.format==='pdf'){writeFileSync(selected.filePath,await output.webContents.printToPDF({printBackground:true,preferCSSPageSize:true}));}else{await output.webContents.insertCSS('html,body{margin:0!important}body{padding:36px!important;box-sizing:border-box!important;width:794px!important}');const height=await output.webContents.executeJavaScript('Math.ceil(document.body.scrollHeight)');if(height>30000)throw new Error('This image is too tall. Export PDF or Word instead.');output.setContentSize(794,Math.max(100,height));await output.webContents.executeJavaScript('new Promise(resolve=>setTimeout(resolve,100))');writeFileSync(selected.filePath,(await output.webContents.capturePage({x:0,y:0,width:794,height:Math.max(100,height)})).toPNG());}return true;}finally{output.destroy();try{unlinkSync(temporary);}catch{}}
});
ipcMain.handle("scoreler-save-practice-pdf", async (event,paper) => {
  if(!mainWindow||event.sender!==mainWindow.webContents||!event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`))throw new Error("Unauthorized PDF request");
  if(typeof paper?.html!=="string"||paper.html.length>5000000||typeof paper.title!=="string")throw new Error("Invalid paper");
  const selected=await dialog.showSaveDialog(mainWindow,{title:"Save practice PDF / 保存练习 PDF",defaultPath:paper.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").slice(0,100)+".pdf",filters:[{name:"PDF",extensions:["pdf"]}]});
  if(selected.canceled||!selected.filePath)return false;
  const printWindow=new BrowserWindow({show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,javascript:false}});
  try{
    const html=paper.html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; font-src http://127.0.0.1:'+serverPort+' data:; img-src data: http://127.0.0.1:'+serverPort+'">');
    await printWindow.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    const pdf=await printWindow.webContents.printToPDF({printBackground:true,preferCSSPageSize:true});
    writeFileSync(selected.filePath,pdf);return true;
  }finally{printWindow.destroy();}
});

ipcMain.handle("scoreler-select-study-folder", async (event) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || !event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`)) throw new Error("Unauthorized folder request");
  const selected = await dialog.showOpenDialog(mainWindow, { title: "Choose study materials / 选择学习资料", properties: ["openDirectory"] });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const response = await fetch(`http://127.0.0.1:${serverPort}/api/student/folders/authorize`, { method: "POST", headers: { "Content-Type": "application/json", "x-scoreler-desktop-token": desktopToken }, body: JSON.stringify({ path: selected.filePaths[0] }) });
  if (!response.ok) throw new Error("Unable to authorize study folder");
  return response.json();
});

ipcMain.handle("scoreler-open-study-item",async(event,item)=>{
  if(!mainWindow||event.sender!==mainWindow.webContents||!event.sender.getURL().startsWith(`http://127.0.0.1:${serverPort}/`))throw new Error("Unauthorized file request");
  const response=await fetch(`http://127.0.0.1:${serverPort}/api/student/workspace/resolve`,{method:"POST",headers:{"Content-Type":"application/json","x-scoreler-desktop-token":desktopToken},body:JSON.stringify(item)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||"Unable to open file");
  if(item.reveal){shell.showItemInFolder(result.path);return true;}const error=await shell.openPath(result.path);if(error)throw new Error(error);return true;
});

ipcMain.handle("inno-open-path", (event, path) => {
  if (typeof path !== "string"
    || path.length === 0
    || !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents) {
    return "";
  }
  return shell.openPath(path);
});

ipcMain.on("inno-close-dialog-copy", (_event, copy) => {
  if (!isCloseDialogCopy(copy)) return;
  closeDialogCopy = {
    title: copy.title,
    message: copy.message,
    detail: copy.detail,
    buttons: {
      hide: copy.buttons.hide,
      quit: copy.buttons.quit,
      cancel: copy.buttons.cancel,
    },
    remember: copy.remember,
  };
});

const MAX_WINDOW_EXPANSION = 1200;

function isWindowExpansionSide(value) {
  return value === "left" || value === "right";
}

function isWindowExpansionRequest(value) {
  return value
    && typeof value === "object"
    && isWindowExpansionSide(value.side)
    && Number.isFinite(value.additionalWidth)
    && value.additionalWidth >= 0;
}

ipcMain.handle("inno-expand-window-width", (event, request) => {
  if (!isWindowExpansionRequest(request)
    || !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents) {
    return false;
  }

  const additionalWidth = Math.min(Math.round(request.additionalWidth), MAX_WINDOW_EXPANSION);
  if (additionalWidth === 0) return true;

  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const nextWidth = currentBounds.width + additionalWidth;

  // Never expand beyond the usable display area. In that case the renderer
  // keeps the panel collapsed instead of squeezing the chat into the gap.
  if (nextWidth > workArea.width) return false;

  const requestedX = request.side === "left"
    ? currentBounds.x - additionalWidth
    : currentBounds.x;
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - nextWidth;
  const nextX = Math.max(minX, Math.min(requestedX, maxX));

  mainWindow.setBounds({
    ...currentBounds,
    x: nextX,
    width: nextWidth,
  }, true);
  return true;
});

ipcMain.handle("inno-window-width-capacity", (event, side) => {
  if (!isWindowExpansionSide(side)
    || !mainWindow
    || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents) {
    return 0;
  }

  const currentBounds = mainWindow.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const capacity = side === "left"
    ? currentBounds.x - workArea.x
    : workArea.x + workArea.width - (currentBounds.x + currentBounds.width);
  return Math.max(0, Math.min(MAX_WINDOW_EXPANSION, Math.floor(capacity)));
});

// ── Loading 窗口（服务启动期间显示） ────────────────────────────────────────
function openLoadingWindow() {
  loadingWindow = new BrowserWindow({
    show:!process.env.SCORELER_SMOKE_DIR,
    icon: scorelerIcon,
    title: process.env.SCORELER_PREVIEW?"Scoreler 1.4 — local preview":"Scoreler",
    width: 400,
    height: 280,
    resizable: false,
    frame: false,
    backgroundColor: appearanceHelper.background(appearanceStore.read()),
    webPreferences: { contextIsolation: true, nodeIntegration: false, preload:join(__dirname,"loading-preload.cjs") },
  });
  if(process.env.SCORELER_SMOKE_DIR){const output=process.env.SCORELER_SMOKE_DIR;mkdirSync(output,{recursive:true});loadingWindow.webContents.once('did-finish-load',async()=>{try{await loadingWindow.webContents.executeJavaScript("new Promise(resolve=>setTimeout(resolve,100))");if(loadingWindow&&!loadingWindow.isDestroyed())writeFileSync(join(output,'scoreler-loading.png'),(await loadingWindow.webContents.capturePage()).toPNG());}catch{}});}
  loadingWindow.loadFile(join(__dirname, "loading.html"));
  loadingWindow.on("closed", () => { loadingWindow = null; });
}

// ── 主窗口 ────────────────────────────────────────────────────────────────────
function getConfiguredCloseBehavior() {
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    const behavior = raw?.ui?.closeBehavior;
    if (behavior === "hide" || behavior === "quit") return behavior;
  } catch { /* 配置尚未生成或无法读取时使用安全默认值 */ }
  return "ask";
}

async function rememberCloseBehavior(closeBehavior) {
  try {
    const response = await fetch(`http://127.0.0.1:${serverPort}/api/settings/close-behavior`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ closeBehavior }),
    });
    if (response.ok) return;
    throw new Error(`settings request failed with status ${response.status}`);
  } catch (error) {
    // Keep the preference even if the local server is already stopping.
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const ui = raw?.ui && typeof raw.ui === "object" && !Array.isArray(raw.ui) ? raw.ui : {};
      raw.ui = { ...ui, closeBehavior };
      writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
    } catch (fallbackError) {
      console.warn("[window] failed to remember close behavior", error, fallbackError);
    }
  }
}

function quitApplication() {
  isQuitting = true;
  // If called from the window's `close` event, wait until the current event
  // finishes before asking Electron to close the window again.
  setImmediate(() => app.quit());
}

/**
 * Probe a port using the same wildcard bind as the HTTP server. The probe is
 * closed before returning; the server child receives the selected port and
 * owns the real listener.
 */
function probePort(port) {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () => {
      const address = probe.address();
      const selectedPort = address && typeof address === "object" ? address.port : port;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(selectedPort);
      });
    });
  });
}

/**
 * Keep the conventional port when possible, but let the desktop app coexist
 * with a separately started dev server, Docker container, or another Inno
 * instance. Without this negotiation the child exits with EADDRINUSE while
 * the renderer may accidentally attach to the other process on port 3000.
 */
async function selectServerPort() {
  try {
    return await probePort(DEFAULT_PORT);
  } catch (error) {
    if (error?.code !== "EADDRINUSE") throw error;
    const fallbackPort = await probePort(0);
    console.warn(`[server] port ${DEFAULT_PORT} is busy; using port ${fallbackPort}`);
    return fallbackPort;
  }
}

async function askCloseBehavior() {
  if (isCloseDialogOpen || !mainWindow || mainWindow.isDestroyed()) return;
  isCloseDialogOpen = true;

  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "question",
      title: closeDialogCopy.title,
      message: closeDialogCopy.message,
      detail: closeDialogCopy.detail,
      buttons: [closeDialogCopy.buttons.hide, closeDialogCopy.buttons.quit, closeDialogCopy.buttons.cancel],
      defaultId: 0,
      cancelId: 2,
      checkboxLabel: closeDialogCopy.remember,
      noLink: true,
    });

    if (!mainWindow || mainWindow.isDestroyed()) return;
    const selectedBehavior = result.response === 0 ? "hide" : result.response === 1 ? "quit" : null;
    if (!selectedBehavior) return;
    if (result.checkboxChecked) await rememberCloseBehavior(selectedBehavior);

    if (selectedBehavior === "hide") {
      mainWindow.hide();
    } else {
      quitApplication();
    }
  } catch (error) {
    console.warn("[window] close confirmation failed", error);
  } finally {
    isCloseDialogOpen = false;
  }
}

function openMainWindow() {
  Menu.setApplicationMenu(null);
  if (mainWindow) { mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    show:!process.env.SCORELER_SMOKE_DIR,
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: process.env.SCORELER_PREVIEW?"Scoreler 1.4 — local preview":"Scoreler",
    icon: scorelerIcon,
    autoHideMenuBar: true,
    // Keep the macOS traffic lights, but let the renderer own the area below
    // them so the app no longer gets the separate native title-bar strip.
    titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 18 } : undefined,
    backgroundColor: appearanceHelper.background(appearanceStore.read()),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.cjs"),
      backgroundThrottling:!process.env.SCORELER_SMOKE_DIR,
      zoomFactor: 1,
    },
  });

  if(process.env.SCORELER_PREVIEW){
    mainWindow.on('page-title-updated',event=>{event.preventDefault();mainWindow?.setTitle('Scoreler 1.4 — local preview');});
  }
  if (process.env.SCORELER_SMOKE_DIR) {
    const output = process.env.SCORELER_SMOKE_DIR;
    mkdirSync(output,{recursive:true});
    const timeout = setTimeout(() => { writeFileSync(join(output,"desktop-result.json"),JSON.stringify({ok:false,error:"Desktop readiness timeout"})); quitApplication(); },60000);
    mainWindow.webContents.once("did-finish-load", async () => {
      try {
        const state = await mainWindow.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const started=Date.now();const check=()=>{const root=document.getElementById('root');if(root?.querySelector('.today-view'))return resolve({title:document.title,rendered:true,language:document.documentElement.lang,folderBridge:typeof window.scorelerDesktop?.selectStudyFolder==='function'});if(Date.now()-started>45000)return reject(new Error('Student UI did not become ready'));setTimeout(check,100);};check();})`);
        await new Promise(resolve=>setTimeout(resolve,300));
        const health=await fetch(`http://127.0.0.1:${serverPort}/api/student/state`).then(r=>r.json());
        const settings=await fetch(`http://127.0.0.1:${serverPort}/api/settings`).then(r=>{if(!r.ok)throw new Error("Agent bootstrap failed");return r.json();});
        const services=await mainWindow.webContents.executeJavaScript("Promise.all([window.scorelerDesktop.mail('state'),window.scorelerDesktop.browser('state')]).then(([mail,browser])=>({mailHandler:typeof mail.configured==='boolean',browserHandler:typeof browser.url==='string'}))");
        if(!services.mailHandler||!services.browserHandler||!mailIntegration?.port)throw Error('Desktop service startup check failed');
        writeFileSync(join(output,'desktop-services.json'),JSON.stringify({...services,mailBridge:true},null,2));
        if(process.env.SCORELER_SMOKE_BROWSER_URL){
          const target=process.env.SCORELER_SMOKE_BROWSER_URL;
          await mainWindow.webContents.executeJavaScript(`window.scorelerDesktop.browser('navigate',${JSON.stringify(target)})`);
          let browser;
          for(let i=0;i<150;i++){await new Promise(resolve=>setTimeout(resolve,100));browser=await mainWindow.webContents.executeJavaScript("window.scorelerDesktop.browser('state')");if(browser.error||browser.url&&!browser.loading)break;}
          writeFileSync(join(output,'desktop-browser.json'),JSON.stringify(browser,null,2));
          if(browser.error||!browser.url||browser.loading)throw Error('Browser navigation check failed: '+JSON.stringify(browser));
        }
        writeFileSync(join(output,"desktop-state.json"),JSON.stringify({ok:true,...state,menuRemoved:Menu.getApplicationMenu()===null,iconPresent:!nativeImage.createFromPath(scorelerIcon).isEmpty(),subjects:health.subjects?.length??0,configuredModel:settings.defaultModel,contextIsolation:mainWindow.webContents.getLastWebPreferences().contextIsolation,nodeIntegration:mainWindow.webContents.getLastWebPreferences().nodeIntegration,electron:process.versions.electron,node:process.versions.node},null,2));
        await mainWindow.webContents.executeJavaScript("new Promise(resolve=>setTimeout(resolve,100))");
        const shot=await mainWindow.webContents.capturePage();
        writeFileSync(join(output,"scoreler-desktop.png"),shot.toPNG());
        writeFileSync(join(output,"desktop-result.json"),JSON.stringify({ok:true,...state,...services,menuRemoved:Menu.getApplicationMenu()===null,iconPresent:!nativeImage.createFromPath(scorelerIcon).isEmpty(),subjects:health.subjects?.length??0,configuredModel:settings.defaultModel,contextIsolation:mainWindow.webContents.getLastWebPreferences().contextIsolation,nodeIntegration:mainWindow.webContents.getLastWebPreferences().nodeIntegration,electron:process.versions.electron,node:process.versions.node},null,2));
      } catch(error) { writeFileSync(join(output,"desktop-result.json"),JSON.stringify({ok:false,error:String(error)})); }
      finally { clearTimeout(timeout); quitApplication(); }
    });
  }
  if(process.platform==='win32'){
    const installed=process.env.SCORELER_INSTALLED_LAUNCHER||join(process.env.LOCALAPPDATA||app.getPath('home'),'Programs','Scoreler','Scoreler.exe');
    mainWindow.setAppDetails({appId:scorelerAppId,appIconPath:scorelerIcon,appIconIndex:0,relaunchDisplayName:'Scoreler',relaunchCommand:!process.env.SCORELER_PREVIEW&&existsSync(installed)?'"'+installed+'"':'"'+process.execPath+'" "'+app.getAppPath()+'" --scoreler-profile="'+app.getPath('userData')+'"'});
    mainWindow.setIcon(scorelerIcon);
  }
  // Local UI HTML must not reuse an index pointing at assets from an older build.
  let localUiRecovered=false;
  const recoverLocalUi=()=>{if(localUiRecovered||!mainWindow||mainWindow.isDestroyed())return;localUiRecovered=true;mainWindow.webContents.reloadIgnoringCache();};
  mainWindow.webContents.on('did-fail-load',(_event,code,_description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3)setTimeout(recoverLocalUi,500);});
  mainWindow.webContents.on('did-finish-load',()=>{setTimeout(()=>{if(!mainWindow||mainWindow.isDestroyed())return;void mainWindow.webContents.executeJavaScript('!!document.getElementById("root")?.childElementCount').then(rendered=>{if(!rendered)recoverLocalUi();}).catch(()=>recoverLocalUi());},2500);});
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`,{extraHeaders:'Cache-Control: no-cache\nPragma: no-cache'});

  // Chromium remembers per-origin page zoom. Reset it for the local app so a
  // previous Ctrl +/- does not compound Windows display scaling on restart.
  mainWindow.webContents.on("did-finish-load", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(1);
    }
  });

  // 原生右键菜单：Electron 默认不弹出系统菜单，这里补上文本编辑的基础项。
  mainWindow.webContents.on("context-menu", (event, params) => {
    const items = [];
    if (params.selectionText) {
      items.push({ role: "cut", label: "剪切", enabled: params.isEditable });
      items.push({ role: "copy", label: "复制" });
    }
    if (params.isEditable) {
      items.push({ role: "paste", label: "粘贴" });
      items.push({ role: "selectAll", label: "全选" });
    }
    if (items.length === 0) return;
    const menu = Menu.buildFromTemplate(items);
    menu.popup({ window: mainWindow });
  });

  // 关闭 loading 窗口
  loadingWindow?.close();

  // 关闭按钮的行为由跨平台设置决定：询问、隐藏窗口或退出应用。
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    if(companion.enabled()){event.preventDefault();mainWindow.hide();return;}

    const behavior = getConfiguredCloseBehavior();
    if (behavior === "hide") {
      event.preventDefault();
      mainWindow.hide();
    } else if (behavior === "ask") {
      event.preventDefault();
      void askCloseBehavior();
    } else {
      event.preventDefault();
      quitApplication();
    }
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(`http://127.0.0.1:${serverPort}/`)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only http(s) may leave the app — file://, smb:// and custom schemes
    // handed to shell.openExternal can trigger OS-level handlers (issue #162).
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "https:" || protocol === "http:") {
        shell.openExternal(url);
      }
    } catch {
      // unparseable URL — deny
    }
    return { action: "deny" };
  });
}

function showMainWindow() {
  if(process.env.SCORELER_SMOKE_DIR){mainWindow?.hide();return;}
  if (!mainWindow) {
    openMainWindow();
    return;
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ── 启动后端服务器 ────────────────────────────────────────────────────────────
async function startServer(onReady) {
  let serverOutput = "";
  let failureReported = false;
  let poll = null;

  const appendServerOutput = (chunk) => {
    serverOutput = `${serverOutput}${chunk.toString()}`.slice(-8000);
  };
  const reportFailure = (message) => {
    if (failureReported || isQuitting) return;
    failureReported = true;
    if (poll) clearInterval(poll);
    const output = serverOutput.trim();
    const detail = output
      ? `${message}\n\n后端输出：\n${output}\n\n日志目录：${join(innoHome, "data", "log")}`
      : `${message}\n\n日志目录：${join(innoHome, "data", "log")}`;
    dialog.showErrorBox("Scoreler 服务启动失败", detail);
  };

  try {
    serverPort = await selectServerPort();
  } catch (error) {
    reportFailure(`无法为后端服务分配端口：${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (isQuitting) return;

  process.env.INNO_HOME = innoHome;
  process.env.INNO_CONFIG_DIR = configDir;
  process.env.INNO_CONFIG_FILE = configPath;
  process.env.INNO_DATA_DIR = join(innoHome, "data");
  process.env.INNO_SKILLS_DIR = join(innoHome, "skills");
  process.env.INNO_WORKSPACE_DIR = join(innoHome, "generated");
  process.env.INNO_PORT = String(serverPort);

  serverProcess = spawn(process.execPath, [serverScript, "--server", "--port", String(serverPort), '--home', innoHome, '--data-dir', join(innoHome,'data'), '--config-dir', configDir, '--config', configPath, '--skills-dir', join(innoHome,'skills'), '--workspace-dir', join(innoHome,'generated')], {
    // INNO_DESKTOP marks the desktop (Electron) runtime: gates desktop-only
    // capabilities like computer-use (see plugins.computerUse in config.ts).
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", INNO_DESKTOP: "1", SCORELER_DESKTOP_TOKEN: desktopToken, SCORELER_INSTANCE_ID: serverInstance, SCORELER_FREE_MODELS:'0', INIT_CWD:innoHome,SCORELER_MAIL_PORT:String(mailIntegration?.port??0),SCORELER_MAIL_TOKEN:desktopToken },
    cwd:innoHome,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });

  chatgpt.attach(serverProcess);
  serverProcess.stdout.on("data", (d) => {
    appendServerOutput(d);
    console.log("[server]", d.toString());
  });
  serverProcess.stderr.on("data", (d) => {
    appendServerOutput(d);
    console.error("[server]", d.toString());
  });

  serverProcess.on("error", (error) => {
    appendServerOutput(error.stack || error.message);
    reportFailure(`无法启动后端进程：${error.message}`);
  });

  serverProcess.on("exit", (code, signal) => {
    if (isQuitting) return;
    if (code !== 0 && code !== null) {
      reportFailure(`服务器进程以代码 ${code} 退出。`);
    } else if (signal) {
      reportFailure(`服务器进程被信号 ${signal} 终止。`);
    }
  });

  // 轮询 /health，最多等待 30s
  let elapsed = 0;
  poll = setInterval(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${serverPort}/health`);
      if (r.ok && (await r.json()).instanceId === serverInstance) {
        clearInterval(poll);
        poll = null;
        onReady?.();
      }
    } catch { /* 还未就绪 */ }
    elapsed += 500;
    if (elapsed >= 30000) {
      reportFailure("后端服务在 30 秒内未能就绪。");
    }
  }, 500);
}

// Start only the installed local Ollama service, and only for explicitly configured local providers.
async function startConfiguredOllama() {
  if (process.platform !== 'win32') return;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const configured = Object.values(config.providers ?? {}).some(provider => {
      try { const url = new URL(provider.baseUrl); return ['127.0.0.1','localhost','[::1]'].includes(url.hostname) && url.port === '11434'; } catch { return false; }
    });
    if (!configured) return;
    try { const response = await fetch('http://127.0.0.1:11434/api/version', {signal:AbortSignal.timeout(1500)}); if (response.ok) return; } catch {}
    const executable = join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Ollama', 'ollama.exe');
    if (!existsSync(executable)) return;
    const child = spawn(executable, ['serve'], {windowsHide:true,stdio:'ignore',detached:true});
    child.on('error', error => console.warn('Local Ollama could not start:', error.message));
    child.unref();
  } catch (error) { console.warn('Local model setup:', error.message); }
}
// ── 应用生命周期 ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try{repairAppShortcut();}catch{}
  if(!hasInstanceLock)return;
  tray = new Tray(nativeImage.createFromPath(scorelerIcon).resize({width:20,height:20}));
  tray.setToolTip("Scoreler");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "打开 Scoreler",
        click: showMainWindow,
      },
      { type: "separator" },
      { label: "桌面伙伴 · Show / hide companion", click: () => companion.toggle() },
      { label: "退出", click: () => app.quit() },
    ])
  );
  tray.on("click", showMainWindow);

  ensureConfig();
  studyBrowser=setupStudyBrowser({home:innoHome,getMainWindow:()=>mainWindow,getPort:()=>serverPort});
  mailIntegration=await setupMail({home:innoHome,token:desktopToken,icon:scorelerIcon,getMainWindow:()=>mainWindow,getPort:()=>serverPort,companion,showMainWindow});
  openLoadingWindow();
  void startConfiguredOllama();
  startServer(() => {void openMainWindow();companion.start();void startTerminalBridge().catch(()=>{});});
});

app.on("window-all-closed", () => {
  // macOS 上关闭所有窗口不退出，保持在托盘运行
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!app.isReady()) return;
  showMainWindow();
});

app.on("before-quit", () => {
  isQuitting = true;
  mailIntegration?.dispose();
  studyBrowser?.dispose();
  countdownNotifications.dispose();
  companion.dispose();
  serverProcess?.kill();
});
