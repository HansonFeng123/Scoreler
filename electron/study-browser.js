import {WebContentsView,ipcMain,session,safeStorage,shell} from 'electron';
import {join,dirname} from 'node:path';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';
export function browserUrl(value){let text=String(value??'').trim();if(!text.includes('://'))text='https://'+text;const url=new URL(text);if(url.protocol!=='https:'||url.username||url.password||url.href.length>8000)throw Error('Use a secure https:// website address.');return url.href;}
export function setupStudyBrowser({home,getMainWindow,getPort}){
 let view=null,attached=false,error='',remembered={},enabled=false;const preferenceFile=join(home,'config','browser-preferences.json');try{enabled=JSON.parse(readFileSync(preferenceFile,'utf8')).enabled===true;}catch{}const file=join(home,'config','browser-sites.json'),vaultFile=join(home,'config','browser-signins.json');
 try{remembered=JSON.parse(readFileSync(file,'utf8'));}catch{}let vault={};try{vault=JSON.parse(readFileSync(vaultFile,'utf8'));}catch{}
 const partition='persist:scoreler-study-'+createHash('sha256').update(home).digest('hex').slice(0,12);
 const state=()=>({enabled,url:view?.webContents.getURL()||'',title:view?.webContents.getTitle()||'',loading:view?.webContents.isLoading()||false,back:view?.webContents.navigationHistory.canGoBack()||false,forward:view?.webContents.navigationHistory.canGoForward()||false,error,sites:remembered,savedSignIn:!!vault[currentOrigin()]});
 const currentOrigin=()=>{try{return new URL(browserUrl(view.webContents.getURL())).origin;}catch{return '';}};
 const emit=()=>{const main=getMainWindow();if(main&&!main.isDestroyed())main.webContents.send('scoreler-browser-state',state());};
 const authorize=e=>{const main=getMainWindow();if(!main||e.sender!==main.webContents||new URL(e.sender.getURL()).origin!==`http://127.0.0.1:${getPort()}`)throw Error('Unauthorized browser request');};
 const persist=()=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(remembered,null,2));};
 function ensure(){if(view&&!view.webContents.isDestroyed())return view;const ses=session.fromPartition(partition);ses.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));ses.setPermissionCheckHandler(()=>false);
  view=new WebContentsView({webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  view.webContents.setWindowOpenHandler(({url})=>{try{void view.webContents.loadURL(browserUrl(url)).catch(()=>{});}catch{}return {action:'deny'};});
  for(const event of ['will-navigate','will-redirect'])view.webContents.on(event,(e,url)=>{try{browserUrl(url);}catch{e.preventDefault();}});
  for(const event of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated'])view.webContents.on(event,()=>{if(event==='did-start-loading')error='';emit();});
  view.webContents.on('did-fail-load',(_e,code,message,_url,isMainFrame)=>{if(isMainFrame&&code!==-3){error=message;emit();}});
  view.webContents.on('render-process-gone',()=>{error='The page stopped responding. Reload it to continue.';emit();});
  return view;
 }
 function hide(){if(view&&attached){const main=getMainWindow();if(main&&!main.isDestroyed())main.contentView.removeChildView(view);attached=false;}}
 ipcMain.handle('scoreler-browser',(e,action,data)=>{authorize(e);const main=getMainWindow();if(action==='state')return state();if(action==='enable'){if(typeof data!=='boolean')throw Error('Invalid browser preference');enabled=data;mkdirSync(dirname(preferenceFile),{recursive:true});writeFileSync(preferenceFile,JSON.stringify({enabled}));if(!enabled){hide();if(view&&!view.webContents.isDestroyed())view.webContents.close();view=null;error='';}emit();return state();}if(action==='open-link'){const url=new URL(String(data));if(!['https:','http:','mailto:'].includes(url.protocol))throw Error('Unsupported email link');void shell.openExternal(url.href);return state();}if(action==='hide'){hide();return state();}
  if(!enabled)throw Error('Built-in browser is disabled. Enable it in Settings first.');
  const target=ensure(),wc=target.webContents;
  if(action==='bounds'){if(!wc.getURL()){hide();return state();}if(!data||!['x','y','width','height'].every(k=>Number.isFinite(data[k])))throw Error('Invalid bounds');const [width,height]=main.getContentSize();const x=Math.max(0,Math.min(width,Math.round(data.x))),y=Math.max(0,Math.min(height,Math.round(data.y)));if(data.width<=0||data.height<=0){hide();return state();}if(!attached){main.contentView.addChildView(target);attached=true;}target.setBounds({x,y,width:Math.max(1,Math.min(width-x,Math.round(data.width))),height:Math.max(1,Math.min(height-y,Math.round(data.height)))});}
  else if(action==='navigate'){const url=browserUrl(data);void wc.loadURL(url).catch(err=>{error=err.code||'Unable to open page';emit();});}
  else if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();
  else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();
  else if(action==='reload')wc.reload();
  else if(action==='external'){const url=browserUrl(wc.getURL());void shell.openExternal(url);}
  else if(action==='save-site'){if(!['managebac','edupage','email'].includes(data?.name))throw Error('Invalid site');remembered[data.name]=browserUrl(data.url);persist();}
  else if(action==='save-signin'){const origin=currentOrigin();if(!origin||!safeStorage.isEncryptionAvailable())throw Error('Open the sign-in page first; secure credential storage is required.');if(typeof data?.username!=='string'||typeof data?.password!=='string'||!data.username||!data.password||data.username.length>500||data.password.length>4096)throw Error('Enter a username and password.');vault[origin]=safeStorage.encryptString(JSON.stringify({username:data.username,password:data.password})).toString('base64');mkdirSync(dirname(file),{recursive:true});writeFileSync(vaultFile,JSON.stringify(vault));}
  else if(action==='forget-signin'){delete vault[currentOrigin()];writeFileSync(vaultFile,JSON.stringify(vault));}
  else if(action==='fill-signin'){const origin=currentOrigin(),encrypted=vault[origin];if(!encrypted)throw Error('No saved sign-in for this website.');const credentials=JSON.parse(safeStorage.decryptString(Buffer.from(encrypted,'base64')));
   return wc.executeJavaScript(`(()=>{if(location.origin!==${JSON.stringify(origin)})throw Error('Page changed. Try again.');const secret=${JSON.stringify(credentials)};const password=[...document.querySelectorAll('input[type=password]')].find(e=>e.getClientRects().length);if(!password)throw Error('No visible sign-in form found.');const form=password.form||document;const user=[...form.querySelectorAll('input')].filter(e=>e!==password&&e.getClientRects().length&&['text','email'].includes(e.type)).find(e=>/user|email|login/i.test(e.name+' '+e.id+' '+e.autocomplete))||[...form.querySelectorAll('input[type=text],input[type=email]')].find(e=>e.getClientRects().length);const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;for(const [input,value]of [[user,secret.username],[password,secret.password]]){if(input){setter.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}}return true;})()`,true);
  }
  emit();return state();
 });
 return {dispose(){hide();if(view&&!view.webContents.isDestroyed())view.webContents.close();}};
}
