// Scoreler-owned, local-only credential storage. No DevKit implementation code.
import {mkdir,lstat,open,readFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import lockfile from 'proper-lockfile';
import {failure} from './errors.js';
const MAX=4*1024*1024;
const identifier=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(s)&&s!=='dynamic_agent_client';
function valid(record){
 if(!record||record.format!==1||typeof record.host!=='string'||!/^urn:uuid:[a-f0-9-]{36}$/.test(record.host)||!Array.isArray(record.accounts))throw failure('storage_invalid');
 const ids=new Set();
 for(const a of record.accounts){if(!identifier(a.client)||typeof a.subject!=='string'||!a.subject||!Array.isArray(a.scopes)||!a.scopes.every(s=>typeof s==='string')||ids.has(a.client)||!['connected','disconnected','reauth_required'].includes(a.status))throw failure('storage_invalid');ids.add(a.client);if(a.tokens&&(typeof a.tokens.access!=='string'||typeof a.tokens.refresh!=='string'||!Number.isFinite(a.tokens.expires)))throw failure('storage_invalid');if(a.pending&&(!a.pending.tokens||a.pending.id!==undefined&&typeof a.pending.id!=='string'||!Number.isFinite(a.pending.received)))throw failure('storage_invalid');}
 if(record.selected&&!ids.has(record.selected))throw failure('storage_invalid');
 if(record.registration&&!identifier(record.registration.client))throw failure('storage_invalid');return record;
}
export function createVault(directory,encryption){
 const file=join(directory,'scoreler-auth.json'),legacy=join(directory,'chatgpt-auth.json');let protectedLock=false;
 const encryptionReady=async()=>{if(!encryption||await encryption.isAvailable()!==true)throw failure('storage_encryption_unavailable');};
 async function readJson(path){try{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX||(process.platform!=='win32'&&(info.mode&0o077)!==0))throw failure('storage_invalid');return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw failure('storage_invalid');}}
 async function atomic(path,value){if(!protectedLock)throw failure('storage_invalid');const bytes=JSON.stringify(value);if(Buffer.byteLength(bytes)>MAX)throw failure('storage_invalid');const temp=path+'.'+randomUUID()+'.tmp';try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}if(!protectedLock)throw failure('storage_invalid');await rename(temp,path);}finally{await rm(temp,{force:true});}}
 async function save(record){await encryptionReady();valid(record);const encrypted=await encryption.encrypt(JSON.stringify(record));if(!(encrypted instanceof Uint8Array)||!encrypted.length)throw failure('storage_invalid');await atomic(file,{format:'scoreler-os-encrypted-v1',provider:encryption.id,data:Buffer.from(encrypted).toString('base64')});}
 async function decrypt(envelope,key){if(envelope.provider!==encryption.id||typeof envelope[key]!=='string'||!envelope[key]||Buffer.from(envelope[key],'base64').toString('base64')!==envelope[key])throw failure('storage_invalid');try{return JSON.parse(await encryption.decrypt(Buffer.from(envelope[key],'base64')));}catch{throw failure('storage_invalid');}}
 async function read(){await encryptionReady();const envelope=await readJson(file);if(envelope){if(envelope.format!=='scoreler-os-encrypted-v1')throw failure('storage_invalid');return valid(await decrypt(envelope,'data'));}
  const old=await readJson(legacy);if(old){if(old.version!==3)throw failure('storage_invalid');const data=await decrypt(old,'ciphertext');if(data.version!==2||!Array.isArray(data.profiles)||!Array.isArray(data.pendingRegistrations))throw failure('storage_invalid');const host=await readJson(join(directory,'chatgpt-host.json'));if(!host||typeof host.id!=='string')throw failure('storage_invalid');
   const migrated={format:1,host:host.id,accounts:data.profiles.map(p=>({client:p.clientId,subject:p.subject,identity:p.identity,status:p.status,scopes:p.scopes,tokens:p.credentials?{access:p.credentials.accessToken,refresh:p.credentials.refreshToken,expires:p.credentials.expiresAt,earliest:p.credentials.earliestRefreshAt}:undefined,pending:p.pendingRefresh?{tokens:{access:p.pendingRefresh.credentials.accessToken,refresh:p.pendingRefresh.credentials.refreshToken,expires:p.pendingRefresh.credentials.expiresAt,earliest:p.pendingRefresh.credentials.earliestRefreshAt},id:p.pendingRefresh.idToken,scopes:p.pendingRefresh.scopes,received:p.pendingRefresh.receivedAt}:undefined})),selected:data.profiles.find(p=>p.id===data.activeProfileId)?.clientId,registration:data.pendingRegistrations[0]?{client:data.pendingRegistrations[0].clientId}:undefined};valid(migrated);await save(migrated);await rm(legacy);return migrated;
  }
  const record={format:1,host:'urn:uuid:'+randomUUID(),accounts:[]};await save(record);return record;
 }
 async function transaction(operation){await encryptionReady();await mkdir(directory,{recursive:true,mode:0o700});const info=await lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw failure('storage_invalid');const release=await lockfile.lock(directory,{lockfilePath:join(directory,'.chatgpt-auth.lock'),stale:120000,update:20000,retries:{retries:20,minTimeout:100,maxTimeout:1000},onCompromised:()=>{protectedLock=false;}});protectedLock=true;try{return await operation({read,save});}finally{protectedLock=false;await release();}}
 return {transaction};
}
