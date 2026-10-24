import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {NetworkSettings} from './NetworkSettings.js';
afterEach(()=>{cleanup();delete window.scorelerDesktop;});
it('switches saved proxy off without erasing its address and saves the explicit choice',async()=>{
 const value={enabled:true,url:'socks5://localhost:1081',fallback:'system'};const network=vi.fn().mockImplementation(async(action,data)=>action==='state'?value:action==='save'?data:{ok:true,status:200});window.scorelerDesktop={network} as any;
 render(<NetworkSettings en notice={()=>{}}/>);const address=await screen.findByLabelText('Saved proxy address');await waitFor(()=>expect((address as HTMLInputElement).value).toBe(value.url));
 fireEvent.click(screen.getByRole('checkbox',{name:'Use saved proxy'}));expect((address as HTMLInputElement).value).toBe(value.url);
 fireEvent.click(screen.getByRole('button',{name:'Save connection settings'}));await waitFor(()=>expect(network).toHaveBeenCalledWith('save',{...value,enabled:false}));
});
it('tests unsaved settings without saving and explains the limited connection test',async()=>{
 const network=vi.fn().mockImplementation(async action=>action==='state'?{enabled:false,url:'',fallback:'system'}:{ok:true,status:200});window.scorelerDesktop={network} as any;
 render(<NetworkSettings en notice={()=>{}}/>);await waitFor(()=>expect((screen.getByLabelText('Saved proxy address') as HTMLInputElement).disabled).toBe(false));
 fireEvent.change(screen.getByLabelText('Saved proxy address'),{target:{value:'http://localhost:8080'}});fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Test connection'}));await screen.findByText(/Connection successful/);expect(network).toHaveBeenCalledWith('test',{enabled:true,url:'http://localhost:8080',fallback:'system'});expect(network.mock.calls.some(c=>c[0]==='save')).toBe(false);
});
