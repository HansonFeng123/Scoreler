import {it,expect} from 'vitest';
import {withChatGPTUserTurn,chatGPTUserTurn} from './chatgpt-activity.js';
it('isolates user turn IDs across asynchronous work and unrelated background calls',async()=>{expect(chatGPTUserTurn()).toBeUndefined();const run=(id:string)=>withChatGPTUserTurn(id,async()=>{await new Promise(r=>setTimeout(r,5));return chatGPTUserTurn();});expect(await Promise.all([run('first'),run('second'),Promise.resolve(chatGPTUserTurn())])).toEqual(['first','second',undefined]);expect(chatGPTUserTurn()).toBeUndefined();});
