import {AsyncLocalStorage} from 'node:async_hooks';
const activity=new AsyncLocalStorage<string>();
/** Only the desktop chat route supplies a user-turn id; jobs have no grant. */
export const withChatGPTUserTurn=<T>(id:string,run:()=>T):T=>activity.run(id,run);
export const chatGPTUserTurn=()=>activity.getStore();
