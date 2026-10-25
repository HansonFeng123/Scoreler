import {chatGPTUserTurn} from './chatgpt-activity.js';
import {getCurrentSystemPrompt,getCurrentTools,normalizeContext} from '@earendil-works/pi-ai';
import {randomUUID} from 'node:crypto';
import {registerApiProvider} from '@earendil-works/pi-ai/compat';
import {AssistantMessageEventStream} from '@earendil-works/pi-ai/utils/event-stream';
import type {AssistantMessage,Context,Model,SimpleStreamOptions} from '@earendil-works/pi-ai';

/** Converts only study content and local functions. No credential or endpoint fields. */
export function studyRequest(model:string,context:Context){
 const transcript=normalizeContext(context);
 const input:unknown[]=[];
 for(const message of transcript.messages){
  if(message.role==='user')input.push({role:'user',content:typeof message.content==='string'?message.content:message.content.map(c=>c.type==='text'?{type:'input_text',text:c.text}:{type:'input_image',image_url:`data:${c.mimeType};base64,${c.data}`})});
  else if(message.role==='assistant'){
   const checkpoint=message.content.find(c=>c.type==='thinking'&&c.thinkingSignature?.startsWith('scoreler-response-output:'));
   if(checkpoint?.type==='thinking'){
    try{const items=JSON.parse(checkpoint.thinkingSignature!.slice('scoreler-response-output:'.length));if(Array.isArray(items)&&items.every(i=>['message','reasoning','function_call'].includes(i.type))){input.push(...items);continue;}}catch{/* Fall back to visible, normalized history. */}
   }
   for(const c of message.content){
   if(c.type==='text'&&c.text)input.push({role:'assistant',content:c.text});
   else if(c.type==='toolCall')input.push({type:'function_call',call_id:c.id.split('|')[0],name:c.name,namespace:'scoreler',arguments:JSON.stringify(c.arguments)});
   }
  }
  else if(message.role==='toolResult')input.push({type:'function_call_output',call_id:message.toolCallId.split('|')[0],output:message.content.filter(c=>c.type==='text').map(c=>c.text).join('\n')});
 }
 // Pi carries instructions and current tool declarations in transcript system messages.
 const functions=getCurrentTools(transcript.messages).map(t=>({type:'function',name:t.name,description:t.description,parameters:t.parameters,strict:false}));
 return {model,instructions:getCurrentSystemPrompt(transcript.messages),input,...(functions.length?{tools:[{type:'namespace',name:'scoreler',description:'Scoreler local study tools',tools:functions}]}:{})};
}

export function streamChatGPT(model:Model<any>,context:Context,options?:SimpleStreamOptions){
 const allowedTools=getCurrentTools(normalizeContext(context).messages);
 const stream=new AssistantMessageEventStream();
 const output:AssistantMessage={role:'assistant',content:[],api:model.api,provider:model.provider,model:model.id,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};
 void (async()=>{
  const id=randomUUID();let timer:ReturnType<typeof setTimeout>|undefined;
  const abort=()=>{process.send?.({type:'scoreler-chatgpt-request',id,cancel:true});};
  try{
   if(!process.send||process.env.INNO_DESKTOP!=='1')throw Error('ChatGPT plan use requires the Scoreler desktop app.');
   options?.signal?.throwIfAborted();stream.push({type:'start',partial:output});
   await new Promise<void>((resolve,reject)=>{
    const cleanup=()=>{process.off('message',receive);options?.signal?.removeEventListener('abort',cancel);clearTimeout(timer);};
    const cancel=()=>{abort();cleanup();reject(Error('ChatGPT request cancelled.'));};
    const receive=(raw:any)=>{if(raw?.type!=='scoreler-chatgpt-reply'||raw.id!==id)return;
     if(typeof raw.delta==='string'){
      if(!output.content.length){output.content.push({type:'text',text:''});stream.push({type:'text_start',contentIndex:0,partial:output});}
      const text=output.content[0];if(text.type==='text'){text.text+=raw.delta;stream.push({type:'text_delta',contentIndex:0,delta:raw.delta,partial:output});}
     }
     if(raw.error){cleanup();reject(Error(String(raw.error)));}
     else if(raw.done){
      if(output.content[0]?.type==='text')stream.push({type:'text_end',contentIndex:0,content:output.content[0].text,partial:output});
      if(Array.isArray(raw.output)&&JSON.stringify(raw.output).length<=16*1024*1024){
       const items=raw.output.filter((item:any)=>['message','reasoning','function_call'].includes(item.type));
       output.content.push({type:'thinking',thinking:'',thinkingSignature:'scoreler-response-output:'+JSON.stringify(items)});
       if(!output.content.some(c=>c.type==='text')){
        const refusal=items.flatMap((item:any)=>item.type==='message'?item.content??[]:[]).filter((c:any)=>c.type==='refusal'&&typeof c.refusal==='string').map((c:any)=>c.refusal).join('\n');
        if(refusal){const index=output.content.push({type:'text',text:refusal})-1;stream.push({type:'text_start',contentIndex:index,partial:output});stream.push({type:'text_delta',contentIndex:index,delta:refusal,partial:output});stream.push({type:'text_end',contentIndex:index,content:refusal,partial:output});}
       }
      }
      for(const item of raw.output??[])if(item.type==='function_call'){
       if(!allowedTools.some(t=>t.name===item.name)||item.namespace&&item.namespace!=='scoreler'){cleanup();reject(Error('ChatGPT returned an unsupported tool.'));return;}
       let args;try{args=JSON.parse(item.arguments);}catch{cleanup();reject(Error('ChatGPT returned invalid tool arguments.'));return;}
       const tool={type:'toolCall' as const,id:item.call_id,name:item.name,arguments:args};const index=output.content.push(tool)-1;
       stream.push({type:'toolcall_start',contentIndex:index,partial:output});stream.push({type:'toolcall_end',contentIndex:index,toolCall:tool,partial:output});
      }
      output.stopReason=output.content.some(c=>c.type==='toolCall')?'toolUse':'stop';cleanup();resolve();
     }
    };
    process.on('message',receive);options?.signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{abort();cleanup();reject(Error('ChatGPT request timed out.'));},240_000);
    process.send!({type:'scoreler-chatgpt-request',id,payload:{...studyRequest(model.id,context),userTurnId:chatGPTUserTurn()}},error=>{if(error){cleanup();reject(Error('Scoreler desktop connection closed.'));}});
   });
   stream.push({type:'done',reason:output.stopReason as 'stop'|'toolUse',message:output});stream.end();
  }catch(error){output.stopReason=options?.signal?.aborted?'aborted':'error';output.errorMessage=error instanceof Error?error.message:'ChatGPT request failed';stream.push({type:'error',reason:output.stopReason,error:output});stream.end();}
 })();return stream;
}
registerApiProvider({api:'scoreler-chatgpt',stream:streamChatGPT,streamSimple:streamChatGPT});
export const chatGPTProvider=(api:string|undefined)=>api==='scoreler-chatgpt'?{streamSimple:streamChatGPT}:{};
