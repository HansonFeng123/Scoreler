import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {Plugins} from './Plugins.js';

afterEach(()=>{cleanup();vi.restoreAllMocks();delete window.scorelerDesktop;});

it('refreshes the independent list and exposes updates without installing anything',async()=>{
 const meta={id:'sample',owner:'Example',name:'Sample',description:'Offline tool',version:'1.0.0',scoreler:{min:'1.3.0',max:'1.99.99'},permissions:[]};
 const entry={...meta,repository:'https://github.com/Example/sample',subjects:[],keywords:[],releases:[{version:'1.0.0'}]};
 const installed={manifest:meta,origin:'catalogue',enabled:true};let finish!:(value:any)=>void;
 const api=vi.fn(async(action:string)=>action==='refresh'?await new Promise(resolve=>finish=resolve):{catalogue:[entry],installed:[installed],appVersion:'1.4.0',catalogueInfo:{source:'bundled',checkedAt:null}});
 window.scorelerDesktop={plugins:api} as any;const notice=vi.fn();render(<Plugins en={true} notice={notice}/>);
 expect(await screen.findByText(/Using the bundled list/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Refresh plugin list'}));
 expect((screen.getByRole('button',{name:'Refresh plugin list'}) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText('Refreshing plugin list…')).toBeTruthy();
 await act(async()=>finish({catalogue:[{...entry,releases:[{version:'1.1.0'}]}],installed:[{...installed,updateVersion:'1.1.0'}],appVersion:'1.4.0',catalogueInfo:{source:'cached',checkedAt:'2026-10-30T00:00:00Z'}}));
 expect(screen.getByText(/Last refreshed:/)).toBeTruthy();expect(screen.getByRole('button',{name:'Review update'})).toBeTruthy();
 expect(api.mock.calls.map(call=>call[0])).toEqual(['list','refresh']);expect(notice).toHaveBeenCalledWith('Plugin list refreshed. Installed plugins were not changed.');
});

it('keeps installed tools visible when refreshing fails',async()=>{
 const meta={id:'sample',owner:'Example',name:'Sample',description:'Offline',version:'1.0.0',scoreler:{min:'1.3.0',max:'1.99.99'},permissions:[]};
 const api=vi.fn(async(action:string)=>{if(action==='refresh')throw Error('Offline: saved list kept');return {catalogue:[],installed:[{manifest:meta,origin:'catalogue',enabled:true}],appVersion:'1.4.0'};});
 window.scorelerDesktop={plugins:api} as any;const notice=vi.fn();render(<Plugins en={false} notice={notice}/>);
 expect(await screen.findByRole('button',{name:'打开工具'})).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'刷新插件列表'}));
 await waitFor(()=>expect(notice).toHaveBeenCalledWith('Offline: saved list kept'));expect(screen.getByRole('button',{name:'打开工具'})).toBeTruthy();expect(api.mock.calls.map(call=>call[0])).toEqual(['list','refresh']);
});

it('shows download progress, brings the review into view, and reports the completed installation',async()=>{
 const meta={id:'offline-translator',owner:'Example',name:'Translator',description:'Offline',version:'1.0.0',scoreler:{min:'1.0.0',max:'1.99.99'},permissions:[]};
 const entry={...meta,repository:'https://github.com/Example/tool',subjects:[],keywords:[],releases:[{version:'1.0.0'}]};
 let installed:any[]=[],finishReview!:(value:any)=>void,progress!:(value:any)=>void;
 const api=vi.fn(async(action:string)=>{if(action==='list')return {catalogue:[entry],installed,appVersion:'1.3.3'};if(action==='review')return await new Promise(resolve=>{finishReview=resolve;});if(action==='install'){installed=[{manifest:meta,origin:'catalogue',enabled:true}];return {catalogue:[entry],installed};}});
 window.scorelerDesktop={plugins:api,onPluginProgress:(fn:(value:any)=>void)=>{progress=fn;return ()=>{};}} as any;
 const scroll=vi.fn();Element.prototype.scrollIntoView=scroll;
 const notice=vi.fn();render(<Plugins en={true} notice={notice}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Review installation'}));
 act(()=>progress({id:meta.id,downloaded:50,total:100}));
 expect((screen.getByRole('progressbar',{name:'Plugin download progress'}) as HTMLProgressElement).value).toBe(50);
 expect(screen.getByText(/50%/)).toBeTruthy();
 await act(async()=>finishReview({manifest:meta,token:'test',source:'Example',sha256:'test'}));
 const review=screen.getByRole('region',{name:'Review plugin'});
 expect(document.activeElement).toBe(review);expect(scroll).toHaveBeenCalled();
 expect(screen.getByText(/Download complete/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Install plugin'}));
 await waitFor(()=>expect(notice).toHaveBeenCalledWith('Plugin installed. Find it in Toolbox.'));
 expect(screen.getByRole('button',{name:'Open tool'})).toBeTruthy();
});
