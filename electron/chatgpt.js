// OAuth and credentials stay in this process. No HTTP proxy or token IPC.
import {createChatGPT,CHATGPT_USAGE_URL} from '@scoreler/chatgpt';
import {join} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';

export function createChatGPTIntegration({app,safeStorage,shell,dialog,getWindow,clientFactory=createChatGPT,fetch:desktopFetch}) {
 const available=()=>app.isReady()&&safeStorage.isEncryptionAvailable()&&(process.platform!=='linux'||['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(safeStorage.getSelectedStorageBackend()));
 const requireEncryption=()=>{if(!available())throw Error('OS credential encryption is unavailable. ChatGPT sign-in is disabled.');};
 const client=clientFactory({fetch:desktopFetch,appName:'Scoreler',appId:'scoreler',redirectPort:0,sendHostId:true,storageDir:join(app.getPath('userData'),'chatgpt'),credentialEncryption:{id:'electron-safe-storage-v1',isAvailable:available,encrypt:text=>{requireEncryption();return safeStorage.encryptString(text);},decrypt:data=>{requireEncryption();return safeStorage.decryptString(Buffer.from(data));}},openBrowser:async url=>{if(new URL(url).origin!=='https://auth.openai.com')throw Error('Invalid authorization destination');await shell.openExternal(url);}});
 const preferencesFile=join(app.getPath('userData'),'chatgpt','selection.json');
 let saved={};try{saved=JSON.parse(readFileSync(preferencesFile,'utf8'));}catch{}
 let catalog=[],selected=typeof saved.model==='string'?saved.model:'',effort=typeof saved.effort==='string'?saved.effort:'',busy=false;
 const welcomed=new Set(Array.isArray(saved.welcomed)?saved.welcomed.filter(x=>typeof x==='string'):[]);
 const persist=()=>{mkdirSync(join(app.getPath('userData'),'chatgpt'),{recursive:true});writeFileSync(preferencesFile,JSON.stringify({model:selected,effort,welcomed:[...welcomed]}));};
 const requests=new Map();
 const state=async()=>({session:await client.getSession(),models:catalog,selected,effort,encryptionAvailable:available()});
 const discover=async()=>{catalog=await client.listModels();if(!catalog.some(m=>m.slug===selected)){selected='';effort='';}return state();};
 async function action(action,value){
  if(action==='state'){const current=await state();if(current.session.sharing&&!catalog.length)try{return await discover();}catch{}return current;}
  if(action==='cancel'){client.cancelSignIn();return state();}
  if(action==='usage'){await shell.openExternal(CHATGPT_USAGE_URL);return state();}
  if(action==='disconnect'){for(const c of requests.values())c.abort();catalog=[];selected='';effort='';persist();try{await client.disconnect();}finally{catalog=[];}return state();}
  if(action==='signin'){
   if(busy)throw Error('A ChatGPT study request is active. Finish or disconnect it first.');
   if(value?.consent!==true)throw Error('Explicit ChatGPT plan-use consent is required.');
   requireEncryption();await client.signIn({reconsent:true});
   const session=await client.getSession();if(session.sharing){
    await discover();
    if(session.profileId&&!welcomed.has(session.profileId)){
     await dialog.showMessageBox(getWindow(),{type:'info',title:'Scoreler · ChatGPT',message:'You are using your ChatGPT plan',detail:'Eligible Scoreler requests use your ChatGPT plan and its limits. Manage app usage and access in ChatGPT Settings. Each inference still requires your permission.',buttons:['Got it'],noLink:true});
     welcomed.add(session.profileId);persist();
    }
   }return state();
  }
  if(action==='models')return discover();
  if(action==='select'){
   if(busy)throw Error('A ChatGPT study request is active. Finish or disconnect it first.');
   const model=catalog.find(m=>m.slug===value?.model);if(!model)throw Error('Refresh and select an available ChatGPT model.');
   if(value.effort&&!model.reasoningLevels?.includes(value.effort))throw Error('That reasoning level is not advertised by this model.');
   selected=model.slug;effort=value.effort||'';persist();return state();
  }
  throw Error('Unsupported ChatGPT action');
 }
 // Private Node IPC is attached only to our own backend child. Every inference
 // requires a native user confirmation, including scheduled/background work.
 function attach(child){child.on('message',async message=>{
  if(!message||message.type!=='scoreler-chatgpt-request'||typeof message.id!=='string')return;
  const {id}=message;
  const reply=payload=>{if(child.connected)child.send({type:'scoreler-chatgpt-reply',id,...payload});};
  if(message.cancel){requests.get(id)?.abort();return;}
  if(busy){reply({error:'Another ChatGPT request is active. Try again after it finishes.'});return;}
  busy=true;const controller=new AbortController();requests.set(id,controller);
  try{
   const payload=message.payload;
   if(!payload||JSON.stringify(payload).length>24*1024*1024||payload.model!==selected||!selected)throw Error('Select this ChatGPT model in Settings before using it.');
   if(!(await client.getSession()).sharing)throw Error('ChatGPT plan-use permission is required.');
   // Recheck catalog entitlement each request; never substitute another account/model.
   const model=(await client.listModels()).find(m=>m.slug===selected);if(!model)throw Error('This model is no longer available to your ChatGPT account.');
   if(Array.isArray(payload.input)&&payload.input.some(item=>Array.isArray(item.content)&&item.content.some(part=>part.type==='input_image'))&&!model.inputModalities?.includes('image'))throw Error('This model does not advertise image input. Choose an image-capable model.');
   if(effort&&!model.reasoningLevels?.includes(effort))throw Error('This reasoning level is no longer available.');
   const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'Scoreler · ChatGPT plan',message:'Allow this study request to use your ChatGPT plan?',detail:'Scoreler will send the current instructions, conversation context, attached study content, and local tool results to OpenAI. Subscription limits apply. This confirmation also covers requests started in the background. Each follow-up request asks again.',buttons:['Cancel','Allow this request'],defaultId:0,cancelId:0,noLink:true});
   if(result.response!==1)throw Error('ChatGPT request cancelled. Nothing was sent for inference.');
   controller.signal.throwIfAborted();
   let output=[];
   const response=await client.streamResponse({model:selected,input:[],instructions:typeof payload.instructions==='string'?payload.instructions:undefined,study:{input:payload.input,tools:payload.tools,...(effort?{reasoning:{effort}}:{})},signal:controller.signal,onDelta:delta=>reply({delta}),onOutput:value=>{output=value;}});
   reply({done:true,text:response.text,output});
  }catch(error){
   // Never propagate SDK/network error objects, request bodies or credentials.
   const known=['Select this ChatGPT model','ChatGPT plan-use','This model is no longer','This model does not advertise','This reasoning level','ChatGPT request cancelled'];
   const messages={subscription_sharing_usage_limit_exceeded:'ChatGPT plan usage limit reached. Manage usage and app limits in ChatGPT settings.',subscription_sharing_user_not_eligible:'This account or workspace is not eligible for ChatGPT plan use.',subscription_sharing_unsupported_capability:'This model or ChatGPT plan connection does not support the requested capability.',subscription_sharing_route_not_supported:'The requested ChatGPT plan operation is unsupported.'};
   const message=known.some(s=>error.message?.startsWith(s))?error.message:messages[error.code]||'ChatGPT request could not complete. Check connection, permission, model capability, or plan usage in Settings.';
   reply({error:message,code:typeof error.code==='string'&&/^[a-z_]{1,60}$/.test(error.code)?error.code:'request_failed'});
  }finally{requests.delete(id);busy=false;}
 });child.once('exit',()=>{for(const c of requests.values())c.abort();});}
 return {action,attach};
}
