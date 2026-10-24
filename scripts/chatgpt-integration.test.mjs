import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createChatGPTIntegration} from '../electron/chatgpt.js';

function harness(t,{available=true,allow=true,sharing=true}={}){
 const home=mkdtempSync(join(tmpdir(),'scoreler-auth-test-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 let config,calls=0,signed=0,confirmations=0;
 const fake={getSession:async()=>({status:'connected',sharing,identity:{name:'Synthetic user'}}),signIn:async()=>{signed++;},cancelSignIn(){},disconnect:async()=>{},listModels:async()=>[{slug:'synthetic',displayName:'Synthetic',reasoningLevels:['low','high']}],streamResponse:async options=>{calls++;assert.equal(options.model,'synthetic');assert.deepEqual(options.study.reasoning,{effort:'high'});options.onDelta('Synthetic answer');options.onOutput([]);return {text:'Synthetic answer'};}};
 const api=createChatGPTIntegration({app:{isReady:()=>true,getPath:()=>home},safeStorage:{isEncryptionAvailable:()=>available,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString(),getSelectedStorageBackend:()=>''},shell:{openExternal:async()=>{}},dialog:{showMessageBox:async()=>{confirmations++;return {response:allow?1:0};}},getWindow:()=>undefined,clientFactory:value=>{config=value;return fake;}});
 const child=new EventEmitter();child.connected=true;child.send=value=>{child.emit('reply',value);};api.attach(child);
 const request=()=>new Promise(resolve=>{const replies=[];const receive=value=>{replies.push(value);if(value.done||value.error){child.off('reply',receive);resolve(replies);}};child.on('reply',receive);child.emit('message',{type:'scoreler-chatgpt-request',id:'test',payload:{model:'synthetic',input:[{role:'user',content:'Synthetic material'}]}});});
 return {api,request,home,get config(){return config;},get counts(){return {calls,signed,confirmations};}};
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
