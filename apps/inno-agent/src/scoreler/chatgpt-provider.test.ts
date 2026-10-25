import {withChatGPTUserTurn} from './chatgpt-activity.js';
import {it,expect} from 'vitest';
import {studyRequest,streamChatGPT} from './chatgpt-provider.js';
it('sends instructions, study history, image input and namespaced local tool context without API credentials',()=>{
 const result=studyRequest('account-model',{systemPrompt:'Study instruction',messages:[{role:'user',content:[{type:'text',text:'Explain this'},{type:'image',mimeType:'image/png',data:'AAAA'}],timestamp:0},{role:'assistant',api:'scoreler-chatgpt',provider:'scoreler-chatgpt',model:'account-model',content:[{type:'toolCall',id:'call_1',name:'student_list',arguments:{}}],stopReason:'toolUse',timestamp:0,usage:{} as any},{role:'toolResult',toolCallId:'call_1',toolName:'student_list',content:[{type:'text',text:'Study material'}],isError:false,timestamp:0}],tools:[{name:'student_list',description:'List study notes',parameters:{type:'object',properties:{}} as any}]});
 expect(result.instructions).toBe('Study instruction');expect(result.tools?.[0]).toMatchObject({type:'namespace',name:'scoreler'});expect(result.input[0]).toMatchObject({role:'user',content:[{type:'input_text'},{type:'input_image'}]});expect(result.input[2]).toMatchObject({type:'function_call_output',call_id:'call_1',output:'Study material'});expect(JSON.stringify(result)).not.toMatch(/apiKey|authorization|refreshToken/);
});
it('fails closed outside the private desktop transport',async()=>{
 const result=await streamChatGPT({api:'scoreler-chatgpt',provider:'scoreler-chatgpt',id:'test'} as any,{messages:[]}).result();expect(result.stopReason).toBe('error');expect(result.errorMessage).toMatch(/desktop app/);
});
it('streams a private desktop reply and returns a local study tool call to the agent',async()=>{
 const send=process.send,desktop=process.env.INNO_DESKTOP,existingListeners=process.listeners('message');
 try{process.env.INNO_DESKTOP='1';process.send=((request:any,callback:any)=>{
  expect(request.payload.userTurnId).toBe('synthetic-user-turn');callback?.(null);queueMicrotask(()=>{const deliver=(message:any)=>{for(const listener of process.listeners('message'))if(!existingListeners.includes(listener))listener(message,undefined);};deliver({type:'scoreler-chatgpt-reply',id:request.id,delta:'Checking notes'});deliver({type:'scoreler-chatgpt-reply',id:request.id,done:true,output:[{type:'function_call',namespace:'scoreler',name:'student_list',call_id:'call_1',arguments:'{}'}]});});return true;
 }) as any;
 const result=await withChatGPTUserTurn('synthetic-user-turn',()=>streamChatGPT({api:'scoreler-chatgpt',provider:'scoreler-chatgpt',id:'synthetic'} as any,{messages:[{role:'user',content:'List my notes',timestamp:0}],tools:[{name:'student_list',description:'List',parameters:{type:'object',properties:{}} as any}]}).result());
 expect(result.stopReason).toBe('toolUse');expect(result.content).toContainEqual({type:'toolCall',id:'call_1',name:'student_list',arguments:{}});
 }finally{process.send=send;if(desktop===undefined)delete process.env.INNO_DESKTOP;else process.env.INNO_DESKTOP=desktop;}
});
it('replays transcript instructions and tool additions/removals from the current Pi engine',()=>{
 const context:any={messages:[{role:'system',content:'Scoreler can create study notes.',toolsAdded:[{name:'student_note_create',description:'Create a note',parameters:{type:'object',properties:{}}},{name:'removed_tool',description:'Old tool',parameters:{type:'object',properties:{}}}],timestamp:0},{role:'user',content:'Save my note',timestamp:1},{role:'system',content:'Use the permanent note library.',toolsRemoved:[{name:'removed_tool'}],timestamp:2}]};
 const request=studyRequest('synthetic',context);expect(request.instructions).toContain('Scoreler can create study notes');expect(request.instructions).toContain('permanent note library');expect(request.tools?.[0].tools.map(t=>t.name)).toEqual(['student_note_create']);expect(request.input).toEqual([{role:'user',content:'Save my note'}]);
});
