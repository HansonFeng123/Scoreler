// Scoreler implementation of the published public-client OAuth/OIDC protocol.
// https://developers.openai.com/siwc/token-sharing-open-source/sign-in
import {createServer} from 'node:http';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createLocalJWKSet,jwtVerify} from 'jose';
import {failure,remoteError} from './errors.js';
export const ISSUER='https://auth.openai.com',RESOURCE='https://api.openai.com/v1';
const random=()=>randomBytes(32).toString('base64url');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createOAuth(config){
 const request=config.fetch??globalThis.fetch;
 async function json(url,init={}){const response=await request(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000),redirect:'error',credentials:'omit'});let value;try{value=await response.json();}catch{throw failure(response.ok?'invalid_token_response':'api_error',response.status);}if(!response.ok)throw remoteError(value,response.status);return value;}
 async function verify(token,client,{nonce,subject,received}={}){let keys;try{keys=await json(ISSUER+'/.well-known/jwks.json');if(!Array.isArray(keys?.keys))throw Error();}catch{throw failure('identity_verification_unavailable');}
  try{const {payload}=await jwtVerify(token,createLocalJWKSet(keys),{issuer:ISSUER,audience:client,algorithms:['RS256'],requiredClaims:['iss','aud','sub','exp','iat'],clockTolerance:5,...(received?{currentDate:new Date(received)}:{})});if(typeof payload.sub!=='string'||!payload.sub||nonce!==undefined&&!same(payload.nonce,nonce)||subject&&payload.sub!==subject||payload.azp!==undefined&&payload.azp!==client||Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==client)throw Error();return {subject:payload.sub,identity:{...(typeof payload.name==='string'?{name:payload.name}:{}),...(typeof payload.email==='string'?{email:payload.email}:{})}};}catch{throw failure('invalid_id_token');}
 }
 function tokens(data,priorScopes){const scopes=typeof data.scope==='string'?data.scope.split(/\s+/).filter(Boolean):priorScopes;if(scopes&&!scopes.includes('chatgpt.tokens.use.direct'))return {scopes};if(!scopes||data.token_type?.toLowerCase()!=='bearer'||typeof data.access_token!=='string'||!data.access_token||typeof data.refresh_token!=='string'||!data.refresh_token||!Number.isFinite(data.expires_in)||data.expires_in<=0||data.expires_in>86400)throw failure('invalid_token_response');return {tokens:{access:data.access_token,refresh:data.refresh_token,expires:Date.now()+data.expires_in*1000,...(data.earliest_refresh_at!==undefined?{earliest:data.earliest_refresh_at}:{})},scopes};}
 async function tokenRequest(form,signal){return json(ISSUER+'/api/accounts/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',accept:'application/json'},body:new URLSearchParams({...form,resource:RESOURCE}),signal});}
 async function authorize({host,account,registration,onRegistration,signal,reconsent}){
  const state=random(),nonce=random(),verifier=random(),known=account?.client??registration?.client;let settle,reject;const callback=new Promise((resolve,no)=>{settle=resolve;reject=no;});void callback.catch(()=>{});let finished=false;
  const fail=e=>{if(!finished){finished=true;reject(e);}};
  const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");const target=new URL(req.url||'/', 'http://127.0.0.1');if(req.method!=='GET'||target.pathname!=='/auth/callback'||req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(404).end();return;}
   if(target.searchParams.getAll('state').length!==1||!same(target.searchParams.get('state'),state)){res.writeHead(400).end('Invalid authorization state.');return;}
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end('<!doctype html><title>Scoreler authorization</title><h1>Return to Scoreler</h1><p>You can close this tab. Scoreler will verify your authorization.</p>');
   if(target.searchParams.has('error')){fail(failure(target.searchParams.get('error')==='access_denied'?'access_denied':'registration_incomplete'));return;}
   const code=target.searchParams.get('code'),client=target.searchParams.get('client_id')??known;if(finished||target.searchParams.getAll('code').length!==1||target.searchParams.getAll('client_id').length>1||!code||code.length>8192||!client||!/^[a-zA-Z0-9_-]{1,200}$/.test(client)||client==='dynamic_agent_client'||known&&client!==known){fail(failure('registration_incomplete'));return;}finished=true;settle({code,client});
  });
  server.headersTimeout=10000;server.requestTimeout=15000;
  const cancel=()=>fail(failure('cancelled'));signal.addEventListener('abort',cancel,{once:true});
  try{await new Promise((resolve,no)=>{server.once('error',no);server.listen(config.redirectPort??0,'127.0.0.1',resolve);});signal.throwIfAborted();const redirect=`http://127.0.0.1:${server.address().port}/auth/callback`;
   const url=new URL(ISSUER+'/api/accounts/authorize');url.search=new URLSearchParams({client_id:known??'dynamic_agent_client',response_type:'code',redirect_uri:redirect,scope:'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',resource:RESOURCE,state,nonce,ext_agent_host_id:host,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url'),...(!known?{agent_name_hint:'Scoreler'}:{}),...(reconsent?{prompt:'consent'}:{})}).toString();await config.openBrowser(url.href);
   const result=await callback;await onRegistration(result.client);const data=await tokenRequest({grant_type:'authorization_code',client_id:result.client,code:result.code,code_verifier:verifier,redirect_uri:redirect},signal);if(typeof data.id_token!=='string')throw failure('invalid_id_token');const identity=await verify(data.id_token,result.client,{nonce,subject:account?.subject});const fields=tokens(data);return {client:result.client,...identity,...fields,status:'connected'};
  }finally{signal.removeEventListener('abort',cancel);server.close();server.closeAllConnections();}
 }
 async function refresh(account,checkpoint){let pending=account.pending;if(!pending){const data=await tokenRequest({grant_type:'refresh_token',client_id:account.client,refresh_token:account.tokens.refresh},AbortSignal.timeout(60000));const fields=tokens(data,account.scopes);if(!fields.tokens)return {...account,tokens:undefined,pending:undefined,scopes:fields.scopes,status:'connected'};if(data.id_token!==undefined&&typeof data.id_token!=='string')throw failure('invalid_id_token');pending={...fields,id:data.id_token,received:Date.now()};await checkpoint(pending);}
  const identity=pending.id?await verify(pending.id,account.client,{subject:account.subject,received:pending.received}):{subject:account.subject,identity:account.identity};const {pending:ignored,...prior}=account;return {...prior,...identity,tokens:pending.tokens,scopes:pending.scopes,status:'connected'};
 }
 async function revoke(account){const token=account.pending?.tokens?.refresh??account.tokens?.refresh;if(!token)return;const response=await request(ISSUER+'/api/accounts/oauth/revoke',{method:'POST',body:new URLSearchParams({client_id:account.client,token,token_type_hint:'refresh_token'}),headers:{'content-type':'application/x-www-form-urlencoded'},redirect:'error',credentials:'omit',signal:AbortSignal.timeout(15000)});await response.body?.cancel();if(!response.ok)throw failure('revocation_failed',response.status);}
 return {authorize,refresh,revoke,json};
}
