import {readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const defaults=()=>({enabled:false,url:'',fallback:'system'});
export function validateNetworkPreferences(value){
 if(!value||typeof value.enabled!=='boolean'||!['system','direct'].includes(value.fallback)||typeof value.url!=='string'||value.url.length>2048||Object.keys(value).some(k=>!['enabled','url','fallback'].includes(k)))throw Error('Invalid proxy settings');
 const raw=value.url.trim();let url='';
 if(raw){let parsed;try{parsed=new URL(raw);}catch{throw Error('Use a SOCKS5, HTTP or HTTPS proxy address');}
  if(!['socks5:','http:','https:'].includes(parsed.protocol)||!parsed.hostname||!parsed.port||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/'&&parsed.pathname!=='')throw Error('Use a proxy host and port without credentials, path or query');
  url=`${parsed.protocol}//${parsed.host}`;
 }
 if(value.enabled&&!url)throw Error('Enter a proxy address before enabling it');
 return {enabled:value.enabled,url,fallback:value.fallback};
}
function proxyConfig(value){return value.enabled?{mode:'fixed_servers',proxyRules:value.url,proxyBypassRules:'localhost;127.0.0.1;[::1]'}:{mode:value.fallback};}

// Dedicated in-memory sessions keep this preference out of browser cookies,
// exports and provider configuration. Switching leaves active requests intact.
export function createNetworkPreferences({app,session}){
 const file=join(app.getPath('userData'),'network','preferences.json');
 let saved=defaults();try{saved=validateNetworkPreferences(JSON.parse(readFileSync(file,'utf8')));}catch{}
 const create=async value=>{await app.whenReady();const connection=session.fromPartition('scoreler-chatgpt-network-'+randomUUID(),{cache:false});await connection.setProxy(proxyConfig(value));return connection;};
 let current=create(saved),saving=false,testing=false;
 // A startup transport failure is reported on use, without an unhandled rejection.
 void current.catch(()=>{});
 async function action(action,value){
  if(action==='state')return {...saved};
  if(action==='save'){
   if(saving)throw Error('Proxy settings are being saved');
   const next=validateNetworkPreferences(value);saving=true;
   try{const candidate=await create(next);mkdirSync(join(app.getPath('userData'),'network'),{recursive:true});const temp=file+'.tmp';writeFileSync(temp,JSON.stringify(next)+'\n',{mode:0o600});renameSync(temp,file);saved=next;current=Promise.resolve(candidate);return {...saved};}finally{saving=false;}
  }
  if(action==='test'){
   if(testing)throw Error('A connection test is already running');
   const candidate=validateNetworkPreferences(value);testing=true;let connection;
   try{connection=await create(candidate);const response=await connection.fetch('https://auth.openai.com/.well-known/openid-configuration',{credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok){await response.body?.cancel();return {ok:false,status:response.status};}
    const data=await response.json();return {ok:data?.issuer==='https://auth.openai.com'&&data?.authorization_endpoint==='https://auth.openai.com/api/accounts/authorize'&&data?.token_endpoint==='https://auth.openai.com/api/accounts/oauth/token'&&data?.jwks_uri==='https://auth.openai.com/.well-known/jwks.json',status:response.status};
   }catch{return {ok:false,status:0};}finally{testing=false;await connection?.closeAllConnections();}
  }
  throw Error('Unsupported network action');
 }
 return {action,fetch:async(url,init)=>{
  const target=new URL(typeof url==='string'?url:url instanceof URL?url.href:url.url);
  if(!['https://auth.openai.com','https://api.openai.com'].includes(target.origin)||target.username||target.password)throw Error('Invalid ChatGPT destination');
  return (await current).fetch(url,{...init,credentials:'omit',redirect:'error'});
 }};
}
