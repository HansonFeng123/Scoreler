import {connect, type Socket} from 'node:net';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';

export class CliConnection {
 private pending=new Map<string,{resolve:(value:any)=>void;reject:(error:Error)=>void;event?:(event:any)=>void}>();
 private constructor(private socket:Socket){}
 static async open(profile:string,startApp?:()=>void):Promise<CliConnection>{
  let started=false,lastError:unknown;
  for(let attempt=0;attempt<90;attempt++){
   try{
    const marker=JSON.parse(await readFile(join(profile,'cli','connection.json'),'utf8'));
    if(marker.protocol!==1||typeof marker.pipe!=='string'||!(/^[a-f0-9]{64}$/).test(marker.token)||!(process.platform==='win32'?/^\\\\\.\\pipe\\scoreler-[a-f0-9]{48}$/.test(marker.pipe):/^.*\/scoreler-[a-f0-9]{48}\.sock$/.test(marker.pipe)))throw Error('Invalid local terminal connection');
    return await new Promise<CliConnection>((resolve,reject)=>{
     const socket=connect(marker.pipe),connection=new CliConnection(socket),decoder=new StringDecoder('utf8');let buffer='',ready=false;
     const timer=setTimeout(()=>{socket.destroy();reject(Error('Scoreler connection timed out'));},3000);
     socket.on('error',error=>{clearTimeout(timer);if(!ready)reject(error);});socket.on('close',()=>{clearTimeout(timer);if(!ready)reject(Error('Scoreler connection closed'));for(const entry of connection.pending.values())entry.reject(Error('Scoreler closed or updated. Reopen the terminal command.'));connection.pending.clear();});
     socket.on('connect',()=>socket.write(JSON.stringify({token:marker.token})+'\n'));
     socket.on('data',chunk=>{buffer+=decoder.write(chunk);if(Buffer.byteLength(buffer)>12*1024*1024){socket.destroy();return;}let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let reply:any;try{reply=JSON.parse(line);}catch{socket.destroy();return;}if(reply.ready&&!ready){ready=true;clearTimeout(timer);resolve(connection);continue;}const request=connection.pending.get(reply.id);if(!request)continue;if(reply.event)request.event?.(reply.event);else{connection.pending.delete(reply.id);reply.error?request.reject(Error(String(reply.error))):request.resolve(reply.result);}}});
    });
   }catch(error){lastError=error;if(!started&&startApp){startApp();started=true;}if(!startApp)break;await new Promise(resolve=>setTimeout(resolve,500));}
  }
  throw Error('Could not connect to the optional CLI. Open Scoreler 1.4 and enable the CLI in Settings. '+(lastError instanceof Error&&lastError.message.includes('Invalid local')?'Invalid connection file.':''));
 }
 request(action:string,value?:unknown,event?:(event:any)=>void):Promise<any>{
  if(this.socket.destroyed)return Promise.reject(Error('Scoreler is disconnected'));
  const id=randomUUID();return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject,event});this.socket.write(JSON.stringify({id,action,value})+'\n',error=>{if(error){this.pending.delete(id);reject(Error('Could not send the Scoreler request'));}});});
 }
 close(){this.socket.end();}
}
