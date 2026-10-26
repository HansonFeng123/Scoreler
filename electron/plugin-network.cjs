const {spawn}=require('node:child_process');
// Host-only downloader. Plugin renderers never receive this transport or proxy.
function createCurlFetch(proxy){
 const saved=new URL(proxy);if(!['socks5:','http:','https:'].includes(saved.protocol)||saved.username||saved.password||!saved.port||saved.search||saved.hash||!['','/'].includes(saved.pathname))throw Error('Invalid plugin proxy');
 return (input,init={})=>new Promise((resolve,reject)=>{
  const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||!['github.com','api.github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname))return reject(Error('Unapproved plugin network destination'));
  const quote=value=>'"'+String(value).replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
  const config='url = '+quote(url.href)+'\nproxy = '+quote(saved.href.replace(/^socks5:/,'socks5h:'))+'\nheader = "Accept: application/vnd.github+json"\nheader = "User-Agent: Scoreler-plugin-downloader"\n';
  const args=['-q','--config','-','--silent','--show-error','--http1.1','--dump-header','-','--proto','=https','--connect-timeout','15','--max-time','120','--max-filesize','5242880','--retry','2','--retry-delay','1'];
  const child=spawn(process.platform==='win32'?'curl.exe':'curl',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let ended=false,size=0;const chunks=[];
  const finish=(error,value)=>{if(ended)return;ended=true;clearTimeout(timer);init.signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>{child.kill();finish(Error('Plugin connection cancelled'));};const timer=setTimeout(()=>{child.kill();finish(Error('Plugin proxy connection timed out'));},125000);init.signal?.addEventListener('abort',abort,{once:true});if(init.signal?.aborted)abort();
  child.stdout.on('data',data=>{size+=data.length;if(size>6*1024*1024){child.kill();finish(Error('Plugin download exceeds the size limit'));}else chunks.push(data);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});child.on('error',()=>finish(Error('Could not start curl for the plugin proxy connection')));
  child.on('close',code=>{if(ended)return;if(code!==0)return finish(Error('Plugin proxy connection failed. Check the proxy and retry.'));try{let bytes=Buffer.concat(chunks),status,headers;while(bytes.subarray(0,5).toString()==='HTTP/'){const end=bytes.indexOf('\r\n\r\n');if(end<0||end>65536)throw Error();const lines=bytes.subarray(0,end).toString('latin1').split('\r\n');status=Number(/^HTTP\/\S+\s+(\d{3})/.exec(lines.shift())?.[1]);headers=new Headers();for(const line of lines){const colon=line.indexOf(':');if(colon>0&&['location','content-type','content-length'].includes(line.slice(0,colon).toLowerCase()))headers.set(line.slice(0,colon),line.slice(colon+1).trim());}bytes=bytes.subarray(end+4);}if(!status||!headers)throw Error();finish(null,new Response(bytes.length?bytes:null,{status,headers}));}catch{finish(Error('Invalid plugin proxy response'));}});child.stdin.end(config);
 });
}
module.exports={createCurlFetch};

