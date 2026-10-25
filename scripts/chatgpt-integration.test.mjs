import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createChatGPTIntegration} from '../electron/chatgpt.js';

function harness(t,{available=true,allow=true,sharing=true,checkboxChecked=false,profileId="synthetic-profile",homeOverride}={}){
 const home=homeOverride??mkdtempSync(join(tmpdir(),'scoreler-auth-test-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 let config,calls=0,signed=0,confirmations=0;const dialogs=[];
 const fake={getSession:async()=>({status:'connected',sharing,profileId,identity:{name:'Synthetic user'}}),signIn:async()=>{signed++;},cancelSignIn(){},disconnect:async()=>{},listModels:async()=>[{slug:'synthetic',displayName:'Synthetic',reasoningLevels:['low','high']}],streamResponse:async options=>{calls++;assert.equal(options.model,'synthetic');assert.deepEqual(options.study.reasoning,{effort:'high'});options.onDelta('Synthetic answer');options.onOutput([]);return {text:'Synthetic answer'};}};
 const api=createChatGPTIntegration({app:{isReady:()=>true,getPath:()=>home},safeStorage:{isEncryptionAvailable:()=>available,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString(),getSelectedStorageBackend:()=>''},shell:{openExternal:async()=>{}},dialog:{showMessageBox:async(...args)=>{dialogs.push(args.at(-1));confirmations++;return {response:allow?1:0,checkboxChecked};}},getWindow:()=>undefined,clientFactory:value=>{config=value;return fake;}});
 const child=new EventEmitter();child.connected=true;child.send=value=>{child.emit('reply',value);};api.attach(child);
 const request=(userTurnId)=>new Promise(resolve=>{const replies=[];const receive=value=>{replies.push(value);if(value.done||value.error){child.off('reply',receive);resolve(replies);}};child.on('reply',receive);child.emit('message',{type:'scoreler-chatgpt-request',id:'test',payload:{model:'synthetic',userTurnId,input:[{role:'user',content:'Synthetic material'}]}});});
 return {api,request,home,dialogs,get config(){return config;},get counts(){return {calls,signed,confirmations};}};
}
test('requires explicit sign-in consent and OS encryption, with Scoreler registration identity',async t=>{
 const h=harness(t,{available:false});assert.equal(h.config.appName,'Scoreler');assert.equal(h.config.sendHostId,true);assert.equal(h.config.redirectPort,0);
 await assert.rejects(h.api.action('signin',{}),/consent/);await assert.rejects(h.api.action('signin',{consent:true}),/encryption/);assert.equal(h.counts.signed,0);
 await assert.rejects(h.config.openBrowser('https://evil.invalid/'),/destination/);
});
test('native refusal or missing plan permission prevents inference',async t=>{
 for(const options of [{allow:false},{sharing:false}]){const h=harness(t,options);await h.api.action('models');await h.api.action('select',{model:'synthetic',effort:'high'});const replies=await h.request();assert.ok(replies.at(-1).error);assert.equal(h.counts.calls,0);}
});
test('private child transport sends responses but never account credentials, and selection survives restart storage',async t=>{
 const h=harness(t);await h.api.action('models');await assert.rejects(h.api.action('select',{model:'synthetic',effort:'unsupported'}),/reasoning/);await h.api.action('select',{model:'synthetic',effort:'high'});
 const replies=await h.request();assert.equal(h.counts.confirmations,1);assert.equal(h.counts.calls,1);assert.equal(replies.at(-1).text,'Synthetic answer');assert.doesNotMatch(JSON.stringify(replies),/accessToken|refreshToken|identity|apiKey/);
 assert.deepEqual(JSON.parse(readFileSync(join(h.home,'chatgpt/selection.json'))),{model:'synthetic',effort:'high',welcomed:[]});
 await h.api.action('disconnect');assert.equal((await h.api.action('state')).selected,'');
});
test('remembered permission applies only to registered user turns and their follow-ups',async t=>{
 const h=harness(t,{checkboxChecked:true}),id='a'.repeat(32);await h.api.action('models');await h.api.action('select',{model:'synthetic',effort:'high'});
 await h.api.action('begin-user-turn',{requestId:id});assert.equal((await h.request(id)).at(-1).done,true);await h.request(id);assert.equal(h.counts.confirmations,1);assert.ok(h.dialogs[0].checkboxLabel);
 await h.api.action('end-user-turn',{requestId:id});await h.request(id);assert.equal(h.counts.confirmations,2);assert.equal(h.dialogs[1].checkboxLabel,undefined);
 const next='b'.repeat(32);await h.api.action('begin-user-turn',{requestId:next});await h.request(next);assert.equal(h.counts.confirmations,2);
 await h.api.action('chat-prompts',{ask:true});await h.api.action('begin-user-turn',{requestId:'c'.repeat(32)});await h.request('c'.repeat(32));assert.equal(h.counts.confirmations,3);
});
test('chat permission survives restart without authorizing other accounts or background work',async t=>{
 const h=harness(t,{checkboxChecked:true}),id='d'.repeat(32);await h.api.action('models');await h.api.action('select',{model:'synthetic',effort:'high'});await h.api.action('begin-user-turn',{requestId:id});await h.request(id);
 const restarted=harness(t,{homeOverride:h.home});await restarted.api.action('models');await restarted.api.action('select',{model:'synthetic',effort:'high'});assert.equal((await restarted.api.action('state')).askBeforeUserChat,false);
 await restarted.api.action('begin-user-turn',{requestId:'e'.repeat(32)});await restarted.request('e'.repeat(32));assert.equal(restarted.counts.confirmations,0);await restarted.request();assert.equal(restarted.counts.confirmations,1);
 const other=harness(t,{homeOverride:h.home,profileId:'other-profile'});assert.equal((await other.api.action('state')).askBeforeUserChat,true);
});
test('cancel cannot remember permission even with its checkbox checked',async t=>{
 const h=harness(t,{allow:false,checkboxChecked:true}),id='f'.repeat(32);await h.api.action('models');await h.api.action('select',{model:'synthetic',effort:'high'});await h.api.action('begin-user-turn',{requestId:id});assert.ok((await h.request(id)).at(-1).error);assert.equal((await h.api.action('state')).askBeforeUserChat,true);assert.equal(h.counts.calls,0);
});
