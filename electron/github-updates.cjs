const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
let profile;
function setProfile(value){profile=value;}
function updateProxy(){if(!profile)return '';let settings,network;try{settings=JSON.parse(fs.readFileSync(path.join(profile,'updates/preferences.json'),'utf8'));}catch{return '';}if(settings.useProxy!==true)return '';try{network=JSON.parse(fs.readFileSync(path.join(profile,'network/preferences.json'),'utf8'));const u=new URL(network.url);if(!['socks5:','http:','https:'].includes(u.protocol)||!u.hostname||!u.port||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname))throw Error();return u.protocol+'//'+u.host;}catch{throw Error('Save a valid proxy address in Connection settings before using it for updates.');}}

const repository='HansonFeng123/Scoreler';
function authorization(){try{const raw=execFileSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe'],timeout:30000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});const password=raw.split(/\r?\n/).find(l=>l.startsWith('password='))?.slice(9);if(!password)throw Error();return 'Bearer '+password;}catch{throw Error('Sign in to GitHub with Git Credential Manager before updating.');}}
function curlRequest(url,proxy,auth,destination,onProgress=()=>{}){return new Promise((resolve,reject)=>{
 const quote=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
 const config=['url = '+quote(url),'proxy = '+quote(proxy),'header = '+quote('Accept: application/vnd.github+json'),'header = '+quote('X-GitHub-Api-Version: 2022-11-28'),...(auth?['header = '+quote('Authorization: '+auth)]:[])].join('\n')+'\n';
 const args=['-q','--config','-','--location','--silent','--show-error','--proto','=https','--proto-redir','=https','--connect-timeout','15','--max-time',destination?'900':'60','--max-filesize',destination?'104857600':'4194304','--write-out','\n%{http_code}',...(destination?['--output',destination]:[])];
 const child=spawn(process.platform==='win32'?'curl.exe':'curl',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let output='',finished=false;
 const timer=destination?setInterval(()=>{try{onProgress(fs.statSync(destination).size,0);}catch{}},1000):undefined;
 const timeout=setTimeout(()=>{child.kill();done(Error('Proxy update request timed out'));},destination?905000:65000);
 function done(error,value){if(finished)return;finished=true;clearTimeout(timeout);clearInterval(timer);error?reject(error):resolve(value);}
 child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4*1024*1024){child.kill();done(Error('Update metadata exceeds the size limit'));}});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>done(Error('Could not start the proxy update connection. Ensure curl is available.')));child.on('close',code=>{if(code!==0)return done(Error('Proxy update connection failed. Check the proxy address and network.'));const i=output.lastIndexOf('\n'),status=Number(output.slice(i+1));if(status<100||status>599)return done(Error('Invalid update response'));done(null,{status,body:output.slice(0,i)});});child.stdin.end(config);
 });}
async function request(endpoint){const timeout=endpoint.startsWith('/zipball/')?900000:180000;const url='https://api.github.com/repos/'+repository+endpoint;const headers={Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};const proxy=updateProxy();const send=async auth=>{if(proxy){const r=await curlRequest(url,proxy,auth);return new Response(r.body,{status:r.status});}return fetch(url,{headers:{...headers,...(auth?{Authorization:auth}:{})},signal:AbortSignal.timeout(timeout)});};let response=await send();if([401,403,404].includes(response.status)){response=await send(authorization());}if(!response.ok)throw Error('GitHub update request failed (HTTP '+response.status+'). Check repository access.');return response;}
async function latest(){const data=await (await request('/commits/main')).json();if(!/^[a-f0-9]{40}$/.test(data.sha))throw Error('Invalid GitHub update commit');return data.sha;}
async function version(commit){if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid update commit');const data=await(await request('/contents/package.json?ref='+commit)).json();const meta=JSON.parse(Buffer.from(data.content,'base64').toString('utf8'));if(typeof meta.version!=='string'||!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(meta.version))throw Error('Invalid update version');return meta.version;}
async function downloadArchive(commit,destination,onProgress=()=>{}){
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Invalid update commit');
 const temporary=destination+'.part';
 for(let attempt=0;attempt<2;attempt++){
  let handle,response;
  try{const proxy=updateProxy();if(proxy){onProgress(0,0);const r=await curlRequest('https://api.github.com/repos/'+repository+'/zipball/'+commit,proxy,undefined,temporary,onProgress);if(r.status!==200)throw Error('GitHub archive request failed (HTTP '+r.status+')');const size=fs.statSync(temporary).size;if(!size||size>100*1024*1024)throw Error('Invalid archive size');onProgress(size,size);await fs.promises.rename(temporary,destination);return;}response=await request('/zipball/'+commit);const total=Number(response.headers.get('content-length'))||0;if(total>100*1024*1024)throw Error('Update archive exceeds the size limit');handle=await fs.promises.open(temporary,'w');let downloaded=0;onProgress(0,total);
   for await(const chunk of response.body){downloaded+=chunk.length;if(downloaded>100*1024*1024)throw Error('Update archive exceeds the size limit');await handle.write(chunk);onProgress(downloaded,total);}
   if(!downloaded||total&&downloaded!==total)throw Error('Incomplete source download');await handle.close();handle=undefined;await fs.promises.rename(temporary,destination);return;
  }catch(error){await handle?.close().catch(()=>{});await response?.body?.cancel().catch(()=>{});try{fs.unlinkSync(temporary);}catch{}if(attempt===1)throw error;}
 }
}
module.exports={latest,request,version,downloadArchive,setProfile,updateProxy};
