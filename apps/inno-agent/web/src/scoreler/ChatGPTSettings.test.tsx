import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {ChatGPTSettings} from './ChatGPTSettings.js';
import {upsertProvider} from '../api/settings.js';
vi.mock('../api/settings.js',()=>({upsertProvider:vi.fn().mockResolvedValue({})}));
afterEach(()=>{cleanup();delete window.scorelerDesktop;});
it('requires visible privacy consent before official browser authorization and reports denied plan permission',async()=>{
 const disconnected={session:{status:'disconnected',sharing:false},models:[],encryptionAvailable:true};
 const api=vi.fn().mockResolvedValue(disconnected);window.scorelerDesktop={chatgpt:api} as any;
 render(<ChatGPTSettings en notice={()=>{}}/>);const button=screen.getByRole('button',{name:'Continue with ChatGPT'});
 expect((button as HTMLButtonElement).disabled).toBe(true);await waitFor(()=>expect(api).toHaveBeenCalledWith('state'));
 fireEvent.click(screen.getByRole('checkbox'));expect((button as HTMLButtonElement).disabled).toBe(false);
 api.mockResolvedValueOnce({...disconnected,session:{status:'connected',sharing:false,identity:{name:'Synthetic user'}}});fireEvent.click(button);
 await waitFor(()=>expect(api).toHaveBeenCalledWith('signin',{consent:true}));expect(await screen.findByText(/Plan-use permission not granted/)).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Use this ChatGPT model'})).toBeNull();
});
it('does not offer sign-in when OS encryption is unavailable',async()=>{
 window.scorelerDesktop={chatgpt:vi.fn().mockResolvedValue({session:{status:'disconnected',sharing:false},models:[],encryptionAvailable:false})} as any;
 render(<ChatGPTSettings en notice={()=>{}}/>);fireEvent.click(screen.getByRole('checkbox'));
 await screen.findByText(/OS secure storage is unavailable/);expect((screen.getByRole('button',{name:'Continue with ChatGPT'}) as HTMLButtonElement).disabled).toBe(true);
});
it('makes the chosen account model the backend default, even when it is not first in the catalog',async()=>{
 const models=[{slug:'first',displayName:'First'},{slug:'chosen',displayName:'Chosen',reasoningLevels:['high']}];
 const api=vi.fn().mockResolvedValue({session:{status:'connected',sharing:true},models,selected:'chosen',effort:'high',encryptionAvailable:true});window.scorelerDesktop={chatgpt:api} as any;
 render(<ChatGPTSettings en notice={()=>{}}/>);const button=await screen.findByRole('button',{name:'Use this ChatGPT model'});fireEvent.click(button);
 await waitFor(()=>expect(upsertProvider).toHaveBeenCalledWith(expect.objectContaining({apiKey:'',makeDefault:true,models:[expect.objectContaining({id:'chosen'}),expect.objectContaining({id:'first'})]})));
});
it('explains the official pre-browser 403 in the notification without reflecting raw error messages',async()=>{
 let failed=false;const notice=vi.fn();
 const state=()=>({session:{status:'disconnected',sharing:false,...(failed?{error:{code:'api_error',status:403,message:'synthetic-private-error'}}:{})},models:[],encryptionAvailable:true});
 window.scorelerDesktop={chatgpt:vi.fn().mockImplementation(async(action:string)=>{if(action==='signin'){failed=true;throw Error('synthetic-private-error');}return state();})} as any;
 render(<ChatGPTSettings en notice={notice}/>);fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Continue with ChatGPT'}));
 await waitFor(()=>expect(notice).toHaveBeenCalledWith(expect.stringContaining('HTTP 403')));expect(JSON.stringify(notice.mock.calls)).not.toContain('synthetic-private-error');
});
