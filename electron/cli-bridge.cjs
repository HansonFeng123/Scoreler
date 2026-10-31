// Local terminal transport. Account credentials and backend authority stay in Electron.
const {StringDecoder}=require('node:string_decoder');
const net=require('node:net'),fs=require('node:fs'),p=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const safeId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(value);
async function* sseEvents(body){let text='';const decoder=new TextDecoder();for await(const chunk of body){text+=decoder.decode(chunk,{stream:true});text=text.replaceAll('\r\n','\n');let end;while((end=text.indexOf('\n\n'))>=0){const frame=text.slice(0,end);text=text.slice(end+2);const data=frame.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data||data==='[DONE]')continue;yield JSON.parse(data);}if(text.length>8*1024*1024)throw Error('Terminal stream frame is too large');}}
function modelState(settings,gpt){const models=Object.entries(settings.providers||{}).flatMap(([provider,config])=>(config.models||[]).map(model=>{let levels=[];if(provider==='scoreler-chatgpt')levels=gpt.models?.find(m=>m.slug===model.id)?.reasoningLevels||[];else{try{if(['openai-completions','openai-responses',undefined].includes(config.api)&&new URL(config.baseUrl).origin==='https://api.deepseek.com'&&['deepseek-flash','deepseek-v4-pro'].includes(model.id))levels=['none','low','high','max'];}catch{}}return {provider,id:model.id,name:model.name||model.id,input:model.input||['text'],levels,effort:provider==='scoreler-chatgpt'?gpt.effort||'':model.reasoningLevel||''};}));if(gpt.session?.sharing)for(const model of gpt.models||[]){const existing=models.find(m=>m.provider==='scoreler-chatgpt'&&m.id===model.slug);if(existing){existing.levels=model.reasoningLevels||[];continue;}models.push({provider:'scoreler-chatgpt',id:model.slug,name:model.displayName||model.slug,input:model.inputModalities?.includes('image')?['text','image']:['text'],levels:model.reasoningLevels||[],effort:gpt.effort||''});}return models;}
function createCliDispatcher({request,chatgpt,version,getLocale=()=>undefined}){
 return async function dispatch(action,value,context,emit){
  const state=async()=>{const [settings,student,gpt]=await Promise.all([request('/api/settings'),request('/api/student/state'),chatgpt.action('state')]);return {version,models:modelState(settings,gpt),provider:settings.defaultProvider,model:settings.defaultModel,events:student.events||[],locale:getLocale()==='zh-CN'||student.preferences?.responseLanguage==='zh-CN'?'zh-CN':'en'};};
  if(action==='state')return state();
  if(action==='new'){if(context.active)throw Error('Stop the current response first');const next=await request('/api/sessions','POST',{});context.sessionId=next.id;return next;}
  if(action==='attach'){if(context.active||typeof value?.name!=='string'||!(/^[^\\/\x00-\x1f]{1,180}\.(pdf|docx|xlsx|pptx|md|txt|csv|json)$/i).test(value.name)||typeof value.data!=='string'||value.data.length>21*1024*1024||!(/^[A-Za-z0-9+/]*={0,2}$/).test(value.data))throw Error('Choose a supported study file no larger than 15 MB');return request('/api/student/chat-attachment','POST',{name:value.name,data:value.data});}
  if(action==='sessions'){const data=await request('/api/sessions');return data;}
  if(action==='resume'){if(context.active||typeof value?.id!=='string'||!(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,159}$/).test(value.id))throw Error('Invalid session or a response is active');const next=await request('/api/sessions/'+value.id);context.sessionId=value.id;return next;}
  if(action==='model'||action==='reasoning'){
   if(context.active)throw Error('Stop the current response before changing models');const current=await state();
   const provider=action==='model'?value?.provider:current.provider,id=action==='model'?value?.model:current.model;
   const model=current.models.find(m=>m.provider===provider&&m.id===id);if(!model)throw Error('Choose one of your configured models');
   if(action==='reasoning'&&value?.effort!==''&&!model.levels.includes(value?.effort))throw Error('This model does not support that reasoning level');
   if(provider==='scoreler-chatgpt'){
    const gpt=await chatgpt.action('select',{model:id,effort:action==='reasoning'?value.effort:''});
    if(action==='model'&&gpt.session?.sharing)await request('/api/settings/providers','PUT',{providerId:'scoreler-chatgpt',api:'scoreler-chatgpt',baseUrl:'https://api.openai.com/v1',apiKey:'',preserveApiKey:true,models:(gpt.models||[]).map(m=>({id:m.slug,name:m.displayName||m.slug,reasoning:!!m.reasoningLevels?.length,input:m.inputModalities?.includes('image')?['text','image']:['text'],contextWindow:128000,maxTokens:8192})),makeDefault:false});
   }
   if(action==='model')await request('/api/settings/model','POST',{provider,model:id});
   else if(provider!=='scoreler-chatgpt')await request('/api/settings/reasoning','POST',{effort:value.effort});
   return state();
  }
  if(action==='abort'){context.cancelled=true;context.controller?.abort();if(context.sessionId&&context.requestId){let turnId=context.turnId;if(!turnId){const status=await request('/api/chat/status/'+encodeURIComponent(context.sessionId));if(status.stream?.clientRequestId===context.requestId)turnId=status.stream.turnId;}if(turnId)await request('/api/chat/'+encodeURIComponent(context.sessionId)+'/'+encodeURIComponent(turnId)+'/abort','POST',{});}return {aborted:true};}
  if(action==='answer'){if(!context.question||!context.turnId||typeof value?.text!=='string'||value.text.length>20000)throw Error('No active question');const questions=context.question.params?.questions?.length?context.question.params.questions:[{}],index=value.index??0;if(!Number.isInteger(index)||index<0||index>=questions.length)throw Error('Choose a question number from the displayed block');context.answers??=new Map();context.answers.set(index,value.text);if(context.answers.size<questions.length)return {pending:true,answered:context.answers.size,total:questions.length};const result={answers:questions.map((question,index)=>({questionIndex:index,question:String(question.question||''),kind:'chat',answer:context.answers.get(index)})),cancelled:false};return request('/api/chat/question-response','POST',{sessionId:context.sessionId,turnId:context.turnId,questionId:context.question.questionId,result});}
  if(action==='permission'){if(!context.permission||!context.turnId||!['allow_once','deny'].includes(value?.decision))throw Error('No active permission request');return request('/api/chat/permission-response','POST',{sessionId:context.sessionId,turnId:context.turnId,requestId:context.permission.requestId,decision:value.decision});}
  if(action!=='chat')throw Error('Unsupported terminal action');
  if(context.active)throw Error('A response is already running');if(!context.sessionId)throw Error('Create a new conversation first');
  if(typeof value?.text!=='string'||!value.text.trim()||value.text.length>100000)throw Error('Enter a message of at most 100000 characters');
  const images=value.images??[];if(!Array.isArray(images)||images.length>5||images.some(i=>!i||!['image/png','image/jpeg','image/webp','image/gif'].includes(i.mimeType)||typeof i.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(i.data))||JSON.stringify(images).length>20*1024*1024)throw Error('Attach at most five images, with a combined size below 15 MB');
  context.active=true;context.cancelled=false;context.controller=new AbortController();const requestId=crypto.randomUUID();context.requestId=requestId;
  try{
   const current=await state(),model=current.models.find(m=>m.provider===current.provider&&m.id===current.model);if(images.length&&!model?.input.includes('image'))throw Error('This model does not advertise image input. Choose an image-capable model.');
   if(current.provider==='scoreler-chatgpt')await chatgpt.action('begin-user-turn',{requestId});context.controller.signal.throwIfAborted();
   const response=await request('/api/chat/stream','POST',{prompt:value.text,images,sessionId:context.sessionId,clientRequestId:requestId},context.controller.signal,true);
   for await(const envelope of sseEvents(response.body)){context.turnId=envelope.turnId||context.turnId;const event=envelope.event||envelope;if(event.type==='thinking_delta')continue;if(event.type==='question'){context.question=event;context.answers=new Map();}if(event.type==='permission_request')context.permission=event;emit(event);if(event.type==='error')throw Error(String(event.message||event.error||'The model request failed'));if(event.type==='aborted')context.cancelled=true;}
   return {completed:!context.cancelled,aborted:!!context.cancelled};
  }finally{await chatgpt.action('end-user-turn',{requestId}).catch(()=>{});context.active=false;context.turnId=null;context.question=null;context.permission=null;context.controller=null;context.requestId=null;}
 };
}
async function createCliBridge({profile,dispatch}){
 const dir=p.join(profile,'cli');fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const nonce=crypto.randomBytes(24).toString('hex'),token=crypto.randomBytes(32).toString('hex');
 const pipe=process.platform==='win32'?'\\\\.\\pipe\\scoreler-'+nonce:p.join(os.tmpdir(),'scoreler-'+nonce+'.sock');
 const sockets=new Set();let closed=false;
 const server=net.createServer(socket=>{sockets.add(socket);let buffer='',authenticated=false;const decoder=new StringDecoder('utf8');const context={};const send=value=>{if(socket.writableLength>8*1024*1024){socket.destroy();return;}if(!socket.destroyed)socket.write(JSON.stringify(value)+'\n');};socket.setTimeout(30000);socket.on('timeout',()=>{if(!authenticated)socket.destroy();});
  socket.on('error',()=>{});socket.on('close',()=>{sockets.delete(socket);if(context.active)void dispatch('abort',{},context,()=>{}).catch(()=>{});});
  socket.on('data',chunk=>{buffer+=decoder.write(chunk);if(Buffer.byteLength(buffer)>24*1024*1024){socket.destroy();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let msg;try{msg=JSON.parse(line);}catch{socket.destroy();return;}if(!msg||typeof msg!=='object'||Array.isArray(msg)){socket.destroy();return;}if(!msg||typeof msg!=='object'||Array.isArray(msg)){socket.destroy();return;}if(!authenticated){if(typeof msg.token!=='string'||!(/^[a-f0-9]{64}$/).test(msg.token)||!crypto.timingSafeEqual(Buffer.from(msg.token),Buffer.from(token))){socket.destroy();return;}authenticated=true;socket.setTimeout(0);send({ready:true});continue;}if(!safeId(msg.id)||typeof msg.action!=='string'){socket.destroy();return;}void Promise.resolve().then(()=>dispatch(msg.action,msg.value,context,event=>send({id:msg.id,event}))).then(result=>send({id:msg.id,result}),error=>send({id:msg.id,error:error?.message||'Terminal request failed'}));}});
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(pipe,resolve);});if(process.platform!=='win32')fs.chmodSync(pipe,0o600);
 const marker=p.join(dir,'connection.json');fs.writeFileSync(marker,JSON.stringify({protocol:1,pipe,token,pid:process.pid}),{mode:0o600});
 return {close:()=>{if(closed)return;closed=true;for(const socket of sockets)socket.destroy();server.close();try{if(JSON.parse(fs.readFileSync(marker,'utf8')).token===token)fs.unlinkSync(marker);}catch{}if(process.platform!=='win32')try{fs.unlinkSync(pipe);}catch{}}};
}
module.exports={createCliBridge,createCliDispatcher,modelState,sseEvents};
