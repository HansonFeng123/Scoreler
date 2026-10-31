const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path'),net=require('node:net');
const {createCliDispatcher,createCliBridge,modelState}=require('../electron/cli-bridge.cjs');
const settings={defaultProvider:'scoreler-chatgpt',defaultModel:'gpt-test',providers:{'scoreler-chatgpt':{apiKey:'private-key',headers:{Authorization:'private-header'},models:[{id:'gpt-test',name:'Test model',input:['text','image']}]}}};
test('terminal state exposes model capabilities without provider credentials',()=>{
 const models=modelState(settings,{effort:'high',models:[{slug:'gpt-test',reasoningLevels:['low','high']}]});
 assert.equal(models[0].effort,'high');assert.deepEqual(models[0].levels,['low','high']);assert(!JSON.stringify(models).includes('private'));
});
test('terminal turns use the existing ChatGPT user grant and stream tool activity',async()=>{
 const actions=[],calls=[];const chatgpt={action:async(name,value)=>{actions.push({name,value});return {models:[{slug:'gpt-test',reasoningLevels:['high']}]};}};
 const request=async(path,method,value)=>{calls.push({path,method,value});if(path==='/api/settings')return settings;if(path==='/api/student/state')return {events:[]};if(path==='/api/sessions')return {id:'test.jsonl'};if(path==='/api/chat/stream'){const events=[{type:'text_delta',delta:'你好'},{type:'tool_start',toolName:'student_calendar_create'},{type:'thinking_delta',delta:'private reasoning'},{type:'done'}];return new Response(events.map(event=>'data: '+JSON.stringify({turnId:'turn',event})+'\n\n').join(''));}throw Error('unexpected route '+path);};
 const dispatch=createCliDispatcher({request,chatgpt,version:'1.4.0'}),context={},events=[];
 await dispatch('new',{},context,()=>{});await dispatch('chat',{text:'安排今天的学习',images:[{mimeType:'image/png',data:'AAAA'}]},context,event=>events.push(event));
 assert.equal(events[0].delta,'你好');assert(events.some(e=>e.toolName==='student_calendar_create'));assert(!JSON.stringify(events).includes('private reasoning'));
 assert.equal(actions.filter(e=>e.name==='begin-user-turn').length,1);assert.equal(actions.filter(e=>e.name==='end-user-turn').length,1);
 const begin=actions.find(e=>e.name==='begin-user-turn');assert.equal(calls.find(e=>e.path==='/api/chat/stream').value.clientRequestId,begin.value.requestId);
 assert.equal(context.active,false);await assert.rejects(dispatch('fetch',{url:'https://example.com'},context,()=>{}),/Unsupported/);
});
test('socket requires a per-launch local secret and preserves fragmented Chinese input',async t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-bridge-')),seen=[];
 const bridge=await createCliBridge({profile,dispatch:async(action,value)=>{seen.push({action,value});return value;}});t.after(()=>{bridge.close();fs.rmSync(profile,{recursive:true,force:true});});
 const marker=JSON.parse(fs.readFileSync(p.join(profile,'cli/connection.json'),'utf8'));
 const malformed=net.connect(marker.pipe);await new Promise(resolve=>malformed.once('connect',resolve));malformed.write('null\n');await new Promise(resolve=>malformed.once('close',resolve));assert.equal(seen.length,0);
 const wrong=net.connect(marker.pipe);await new Promise(resolve=>wrong.once('connect',resolve));wrong.write(JSON.stringify({token:'0'.repeat(64)})+'\n');await new Promise(resolve=>wrong.once('close',resolve));assert.equal(seen.length,0);
 const socket=net.connect(marker.pipe);t.after(()=>socket.destroy());await new Promise(resolve=>socket.once('connect',resolve));let buffer='';const replies=[];socket.on('data',chunk=>{buffer+=chunk.toString();let end;while((end=buffer.indexOf('\n'))>=0){replies.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);}});
 socket.write(JSON.stringify({token:marker.token})+'\n');
 const bytes=Buffer.from(JSON.stringify({id:'synthetic',action:'echo',value:'中文'})+'\n'),cut=bytes.indexOf(Buffer.from('中'))+1;socket.write(bytes.subarray(0,cut));socket.write(bytes.subarray(cut));
 for(let i=0;i<100&&!replies.some(r=>r.id==='synthetic');i++)await new Promise(r=>setTimeout(r,10));assert.equal(replies.find(r=>r.id==='synthetic').result,'中文');
});
test('connected ChatGPT models appear without a saved provider and selecting one registers only model metadata',async()=>{
 const local={defaultProvider:'other',defaultModel:'local',providers:{other:{models:[{id:'local'}],apiKey:'keep-secret'}}},gpt={session:{sharing:true},models:[{slug:'gpt-connected',displayName:'Connected GPT',inputModalities:['text','image'],reasoningLevels:['low','high']}],effort:'low'};
 assert(modelState(local,gpt).some(m=>m.id==='gpt-connected'));assert(!JSON.stringify(modelState(local,gpt)).includes('keep-secret'));
 const calls=[],dispatch=createCliDispatcher({version:'1.4.0',chatgpt:{action:async()=>gpt},request:async(path,method,value)=>{calls.push({path,method,value});if(path==='/api/settings')return local;if(path==='/api/student/state')return {events:[]};return {};}});
 await dispatch('model',{provider:'scoreler-chatgpt',model:'gpt-connected'},{},()=>{});
 const registration=calls.find(c=>c.path==='/api/settings/providers');assert.equal(registration.value.api,'scoreler-chatgpt');assert.equal(registration.value.models[0].id,'gpt-connected');assert.equal(registration.value.apiKey,'');assert.equal(local.providers.other.apiKey,'keep-secret');assert.equal(modelState(local,{session:{sharing:false},models:gpt.models}).some(m=>m.id==='gpt-connected'),false);
});
