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
 const requests=new Map(),userTurns=new Map();
 const consentFile=join(app.getPath('userData'),'chatgpt','consent.json');let consent={};try{consent=JSON.parse(readFileSync(consentFile,'utf8'));}catch{}
 const saveConsent=()=>{mkdirSync(join(app.getPath('userData'),'chatgpt'),{recursive:true});writeFileSync(consentFile,JSON.stringify(consent));};
 const validTurn=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{16,80}$/.test(id);
 const backgroundNotice='Authorize Scoreler background study requests for this connected account, including dictation generation/correction and study automations you enable. Scoreler may send instructions, relevant conversation/memory, attached study content and local tool results to OpenAI when you are not interacting with the chat. Subscription limits apply. This does not authorize other users, other apps or a general API proxy. You can restore confirmation in Settings or revoke access by disconnecting.';
 const state=async()=>{const session=await client.getSession();return {session,models:catalog,selected,effort,encryptionAvailable:available(),askBeforeUserChat:!(session.sharing&&consent.skipProfile&&session.profileId===consent.skipProfile),askBeforeBackground:!(session.sharing&&consent.backgroundProfile&&session.profileId===consent.backgroundProfile)};};
 const discover=async()=>{catalog=await client.listModels();if(!catalog.some(m=>m.slug===selected)){selected='';effort='';}return state();};
 async function action(action,value){
  if(action==='state'){const current=await state();if(current.session.sharing&&!catalog.length)try{return await discover();}catch{}return current;}
  if(action==='begin-user-turn'){
   if(!validTurn(value?.requestId))throw Error('Invalid chat turn');const current=await client.getSession();
   for(const [id,turn] of userTurns)if(turn.expires<Date.now())userTurns.delete(id);
   if(current.sharing&&current.profileId){if(userTurns.has(value.requestId))throw Error('Chat turn already started');if(userTurns.size>=64)throw Error('Too many active chat turns');userTurns.set(value.requestId,{profile:current.profileId,model:selected,expires:Date.now()+30*60_000,allowed:false});}return {started:true};
  }
  if(action==='end-user-turn'){if(validTurn(value?.requestId))userTurns.delete(value.requestId);return {ended:true};}
  if(action==='chat-prompts'){if(typeof value?.ask!=='boolean')throw Error('Invalid chat preference');const current=await client.getSession();if(!value.ask&&!current.sharing)throw Error('Connect ChatGPT first');if(value.ask)delete consent.skipProfile;else consent={...consent,skipProfile:current.profileId};saveConsent();return state();}
  if(action==='background-prompts'){if(typeof value?.ask!=='boolean')throw Error('Invalid background preference');const current=await client.getSession();if(value.ask){delete consent.backgroundProfile;saveConsent();}else{if(!current.sharing||!current.profileId)throw Error('Connect ChatGPT first');const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'Scoreler · Background permission',message:'Remember permission for Scoreler background study requests?',detail:backgroundNotice,buttons:['Cancel','Authorize background study use'],defaultId:0,cancelId:0,noLink:true});if(result.response===1){consent={...consent,backgroundProfile:current.profileId};saveConsent();}}return state();}
  if(action==='cancel'){client.cancelSignIn();return state();}
  if(action==='usage'){await shell.openExternal(CHATGPT_USAGE_URL);return state();}
  if(action==='disconnect'){userTurns.clear();consent={};saveConsent();for(const c of requests.values())c.abort();catalog=[];selected='';effort='';persist();try{await client.disconnect();}finally{catalog=[];}return state();}
  if(action==='signin'){
   if(busy)throw Error('A ChatGPT study request is active. Finish or disconnect it first.');
   if(value?.consent!==true)throw Error('Explicit ChatGPT plan-use consent is required.');
   requireEncryption();await client.signIn({reconsent:true});
   const session=await client.getSession();if(session.sharing){
    await discover();
    if(session.profileId&&!welcomed.has(session.profileId)){
     await dialog.showMessageBox(getWindow(),{type:'info',title:'Scoreler · ChatGPT',message:'You are using your ChatGPT plan',detail:'Eligible Scoreler requests use your ChatGPT plan and its limits. Manage app usage and access in ChatGPT Settings. Sending a chat message authorizes its response and tool follow-ups. You can remember chat permission; background permission is separate and can be remembered explicitly.',buttons:['Got it'],noLink:true});
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
 // User chat grants are registered by the trusted main-window IPC and expire
 // when that turn ends. Background requests use only a separate express background grant.
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
   const currentSession=await client.getSession();if(!currentSession.sharing)throw Error('ChatGPT plan-use permission is required.');
   // Recheck catalog entitlement each request; never substitute another account/model.
   const model=(await client.listModels()).find(m=>m.slug===selected);if(!model)throw Error('This model is no longer available to your ChatGPT account.');
   if(Array.isArray(payload.input)&&payload.input.some(item=>Array.isArray(item.content)&&item.content.some(part=>part.type==='input_image'))&&!model.inputModalities?.includes('image'))throw Error('This model does not advertise image input. Choose an image-capable model.');
   if(effort&&!model.reasoningLevels?.includes(effort))throw Error('This reasoning level is no longer available.');
   const candidate=userTurns.get(payload.userTurnId),turn=candidate&&candidate.expires>Date.now()&&candidate.profile===currentSession.profileId&&candidate.model===selected?candidate:undefined;
   const remembered=!!currentSession.profileId&&(turn?consent.skipProfile===currentSession.profileId:consent.backgroundProfile===currentSession.profileId);
   if(!turn?.allowed&&!remembered){
    const result=await dialog.showMessageBox(getWindow(),{type:'question',title:'Scoreler · ChatGPT plan',message:turn?'Allow this chat turn to use your ChatGPT plan?':'Allow this background request to use your ChatGPT plan?',detail:'Scoreler sends your instructions, relevant conversation, attached study content and local tool results to OpenAI. Subscription limits apply. '+(turn?'This covers the response and tool follow-ups for the message you sent. Background activity asks separately.':backgroundNotice),buttons:['Cancel','Allow this request'],defaultId:0,cancelId:0,noLink:true,checkboxLabel:turn?"Don't ask again for messages I send":"Don't ask again for Scoreler background study requests",checkboxChecked:false});
    if(result.response!==1)throw Error('ChatGPT request cancelled. Nothing was sent for inference.');
    if(result.checkboxChecked&&currentSession.profileId){consent={...consent,...(turn?{skipProfile:currentSession.profileId}:{backgroundProfile:currentSession.profileId})};saveConsent();}
   }
   if(turn){if(userTurns.get(payload.userTurnId)!==turn)throw Error('ChatGPT request cancelled. This chat turn ended.');turn.allowed=true;}
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
