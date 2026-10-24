import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNetworkPreferences,validateNetworkPreferences} from '../electron/network-preferences.js';
const proxy={enabled:true,url:'socks5://localhost:1081',fallback:'direct'};
test('rejects proxy credentials, paths, PAC URLs and malformed values without reflecting them',()=>{
 for(const url of ['https://secret:password@localhost:8080','socks5://localhost:1081/path','file:///proxy','http://localhost:8080?secret=1','http://localhost','socks4://localhost:1081'])assert.throws(()=>validateNetworkPreferences({...proxy,url}));
 assert.throws(()=>validateNetworkPreferences({...proxy,enabled:'yes'}));
 assert.throws(()=>validateNetworkPreferences({...proxy,unknown:true}));
});
test('saved address survives disabling and restart; tests do not change saved routing',async t=>{
 const home=mkdtempSync(join(tmpdir(),'scoreler-proxy-test-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const connections=[];
 const app={getPath:()=>home,whenReady:async()=>{}};
 const session={fromPartition(name,options){assert.ok(!name.startsWith('persist:'));assert.equal(options.cache,false);const connection={config:null,closed:false,setProxy:async function(config){this.config=config;},closeAllConnections:async function(){this.closed=true;},fetch:async function(url,init){assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');return Response.json({issuer:'https://auth.openai.com',authorization_endpoint:'https://auth.openai.com/api/accounts/authorize',token_endpoint:'https://auth.openai.com/api/accounts/oauth/token',jwks_uri:'https://auth.openai.com/.well-known/jwks.json'});}};connections.push(connection);return connection;}};
 const manager=createNetworkPreferences({app,session});await manager.action('save',proxy);
 assert.equal(connections.at(-1).config.proxyRules,proxy.url);
 const disabled={...proxy,enabled:false};await manager.action('save',disabled);assert.deepEqual(await manager.action('state'),disabled);assert.equal(connections.at(-1).config.mode,'direct');
 assert.deepEqual(await manager.action('test',proxy),{ok:true,status:200});assert.ok(connections.at(-1).closed);assert.deepEqual(await manager.action('state'),disabled);
 const restarted=createNetworkPreferences({app,session});assert.deepEqual(await restarted.action('state'),disabled);await restarted.fetch('https://api.openai.com/v1/models');assert.equal(connections.at(-1).config.mode,'direct');
 await restarted.action('save',proxy);await restarted.fetch('https://api.openai.com/v1/models');assert.equal(connections.at(-1).config.proxyRules,proxy.url);
 await assert.rejects(restarted.fetch('https://evil.invalid/'));await assert.rejects(restarted.action('save',{...proxy,url:'http://user:secret@localhost:8080'}));
 assert.deepEqual(JSON.parse(readFileSync(join(home,'network/preferences.json'),'utf8')),proxy);
});
