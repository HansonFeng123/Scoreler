import {streamOpenAICompletions,streamOpenAIResponses} from '@earendil-works/pi-ai/compat';
import type {InnoProviderConfig} from '../config.js';

export function officialDeepSeek(provider:Pick<InnoProviderConfig,'baseUrl'|'api'>,model:string){
 try{return new URL(provider.baseUrl).origin==='https://api.deepseek.com'&&['openai-completions','openai-responses',undefined].includes(provider.api)&&['deepseek-flash','deepseek-v4-pro'].includes(model);}catch{return false;}
}
export function deepSeekPayload(payload:any,level:string){
 const next={...payload};
 if(['none','low','high','max'].includes(level)){
  next.thinking={type:level==='none'?'disabled':'enabled'};next.reasoning_effort=level;
  // The official thinking/tool route requires reasoning_content on history.
  if(Array.isArray(next.messages))next.messages=next.messages.map((m:any)=>m.role==='assistant'?{...m,reasoning_content:m.reasoning_content??''}:m);
 }
 return next;
}
export function reasoningProvider(provider:InnoProviderConfig){
 if(!provider.models.some(m=>officialDeepSeek(provider,m.id)))return {};
 return {streamSimple:(model:any,context:any,options:any)=>{
  const cfg=provider.models.find(m=>m.id===model.id),level=cfg?.reasoningLevel;
  const stream=provider.api==='openai-responses'?streamOpenAIResponses:streamOpenAICompletions;
  return stream(model,context,{...options,onPayload:async(payload:any,m:any)=>{
   const value=await options?.onPayload?.(payload,m)??payload;
   if(!level||!officialDeepSeek(provider,model.id))return value;
   return provider.api==='openai-responses'?{...value,reasoning:{effort:level}}:deepSeekPayload(value,level);
  }});
 }};
}
