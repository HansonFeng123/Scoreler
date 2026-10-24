import {it,expect,vi} from 'vitest';
import {deepSeekPayload,officialDeepSeek,reasoningProvider} from './reasoning.js';
import {normalizeModelConfig} from '../config.js';
it('enables reasoning controls only for the verified official DeepSeek models and origin',()=>{
 expect(officialDeepSeek({baseUrl:'https://api.deepseek.com/v1',api:'openai-completions'},'deepseek-flash')).toBe(true);
 for(const baseUrl of ['https://api.deepseek.com.evil.invalid/v1','http://api.deepseek.com','https://example.invalid'])expect(officialDeepSeek({baseUrl},'deepseek-flash')).toBe(false);
 expect(officialDeepSeek({baseUrl:'https://api.deepseek.com'},'unknown')).toBe(false);
});
it('serializes the actual DeepSeek stream request with the chosen effort and prior reasoning tool context',async()=>{
 let body:any;
 const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async(_url,options)=>{
  body=JSON.parse(String(options?.body));
  return new Response('data: '+JSON.stringify({id:'synthetic',object:'chat.completion.chunk',choices:[{index:0,delta:{role:'assistant',content:'Synthetic answer'},finish_reason:null}]})+'\n\ndata: '+JSON.stringify({id:'synthetic',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 });
 try{
  const model={id:'deepseek-flash',provider:'synthetic-deepseek',api:'openai-completions',baseUrl:'https://api.deepseek.com/v1',name:'Synthetic',reasoning:true,input:['text'],contextWindow:128000,maxTokens:8192,cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:{supportsDeveloperRole:false}};
  const provider={baseUrl:model.baseUrl,api:model.api,apiKey:'synthetic-not-a-real-key',models:[{...model,reasoningLevel:'max'}]} as any;
  const stream=reasoningProvider(provider).streamSimple!;
  const result=await stream(model as any,{messages:[{role:'user',content:'List notes',timestamp:0},{role:'assistant',api:model.api,provider:model.provider,model:model.id,content:[{type:'thinking',thinking:'Synthetic prior reasoning',thinkingSignature:'reasoning_content'},{type:'toolCall',id:'call_1',name:'student_list',arguments:{}}],stopReason:'toolUse',timestamp:0,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}},{role:'toolResult',toolCallId:'call_1',toolName:'student_list',content:[{type:'text',text:'Synthetic notes'}],isError:false,timestamp:0}]},{apiKey:provider.apiKey}).result();
  expect(result.stopReason).toBe('stop');expect(body.reasoning_effort).toBe('max');expect(body.thinking).toEqual({type:'enabled'});expect(body.messages.find((m:any)=>m.role==='assistant').reasoning_content).toBe('Synthetic prior reasoning');
 }finally{fetch.mockRestore();}
});
it('preserves reasoning history for tool follow-ups and saves the selected level',()=>{
 const payload={messages:[{role:'assistant',content:'',reasoning_content:'Prior reasoning',tool_calls:[{id:'call-test'}]},{role:'tool',content:'result'}]};
 for(const level of ['none','low','high','max']){const result=deepSeekPayload(payload,level);expect(result.reasoning_effort).toBe(level);expect(result.thinking.type).toBe(level==='none'?'disabled':'enabled');expect(result.messages[0].reasoning_content).toBe('Prior reasoning');}
 expect(payload).not.toHaveProperty('thinking');expect(normalizeModelConfig({id:'deepseek-flash',reasoningLevel:'max'}).reasoningLevel).toBe('max');
});
