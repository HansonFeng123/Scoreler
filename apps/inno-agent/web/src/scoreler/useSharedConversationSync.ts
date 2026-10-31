import {useEffect} from 'react';
import {getSession,listSessions,type SessionMeta} from '../api/sessions.js';
import type {ChatMessage} from '../types/chat.js';
/** Refresh externally changed sessions without replacing a draft or an active desktop response. */
export function useSharedConversationSync(sessionId:string|null,busy:boolean,setSessions:(sessions:SessionMeta[])=>void,setMessages:(messages:ChatMessage[])=>void){
 useEffect(()=>{
  let stopped=false,loading=false,revision:string|undefined;
  const sync=async()=>{
   if(stopped||loading||busy||document.visibilityState==='hidden')return;
   loading=true;
   try{const sessions=await listSessions();if(stopped)return;setSessions(sessions);
    if(sessionId){const session=await getSession(sessionId);if(stopped)return;if(session.sessionRevision!==revision){revision=session.sessionRevision;setMessages(session.messages);}}
   }catch{/* A temporary disconnect must not discard the visible conversation or draft. */}
   finally{loading=false;}
  };
  const timer=setInterval(()=>void sync(),5000),onFocus=()=>void sync();
  window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus);
  return()=>{stopped=true;clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
 },[sessionId,busy,setSessions,setMessages]);
}
