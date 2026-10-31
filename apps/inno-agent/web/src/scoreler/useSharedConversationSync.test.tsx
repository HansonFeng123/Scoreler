import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {act,renderHook,cleanup} from '@testing-library/react';
import {useSharedConversationSync} from './useSharedConversationSync.js';
import {listSessions,getSession} from '../api/sessions.js';
vi.mock('../api/sessions.js',()=>({listSessions:vi.fn(),getSession:vi.fn()}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
it('refreshes externally saved history and the selected idle conversation on focus and polling',async()=>{
 vi.useFakeTimers();const sessions=vi.fn(),messages=vi.fn();vi.mocked(listSessions).mockResolvedValue([{id:'cli-session',name:'CLI question'}] as any);vi.mocked(getSession).mockResolvedValue({sessionRevision:'r1',messages:[{role:'assistant',content:'CLI response'}]} as any);
 renderHook(()=>useSharedConversationSync('cli-session',false,sessions,messages));
 await act(async()=>{window.dispatchEvent(new Event('focus'));});expect(sessions).toHaveBeenCalledWith([{id:'cli-session',name:'CLI question'}]);expect(messages).toHaveBeenCalledWith([{role:'assistant',content:'CLI response'}]);
 await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(messages).toHaveBeenCalledTimes(1);
 vi.mocked(getSession).mockResolvedValue({sessionRevision:'r2',messages:[{role:'assistant',content:'Updated response'}]} as any);await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});expect(messages).toHaveBeenLastCalledWith([{role:'assistant',content:'Updated response'}]);
});
it('does not replace an active desktop response and ignores requests completing after navigation',async()=>{
 vi.useFakeTimers();const sessions=vi.fn(),messages=vi.fn();const hook=renderHook(({id,busy})=>useSharedConversationSync(id,busy,sessions,messages),{initialProps:{id:'old',busy:true}});
 await act(async()=>{window.dispatchEvent(new Event('focus'));await vi.advanceTimersByTimeAsync(5000);});expect(listSessions).not.toHaveBeenCalled();
 let complete!:(value:any)=>void;vi.mocked(listSessions).mockImplementationOnce(()=>new Promise(resolve=>complete=resolve));hook.rerender({id:'old',busy:false});await act(async()=>{window.dispatchEvent(new Event('focus'));});hook.unmount();await act(async()=>complete([{id:'old'}]));expect(sessions).not.toHaveBeenCalled();expect(messages).not.toHaveBeenCalled();
});
