import React from 'react';import {it,expect,vi,afterEach} from 'vitest';import {render,screen,fireEvent,cleanup} from '@testing-library/react';import {EventEditor} from './Scoreler.js';import {copy} from './copy.js';
afterEach(cleanup);
it.each(['lesson','study','assignment','exam'] as const)('finishes %s while saving edited fields',kind=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=vi.fn();const save=vi.fn(async()=>{});
 render(<EventEditor t={copy.en} event={{id:'task',kind,title:'Original',start:'2026-10-20T08:00:00Z',end:'2026-10-20T09:00:00Z',completed:false}} close={()=>{}} save={save}/>);
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'Edited'}});fireEvent.click(screen.getByRole('button',{name:'Mark finished'}));expect(save).toHaveBeenCalledWith(expect.objectContaining({id:'task',kind,title:'Edited',completed:true}));
});
it('can reopen a finished task, and ordinary Save preserves completion',()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=vi.fn();const save=vi.fn(async()=>{});
 render(<EventEditor t={copy.en} event={{id:'task',title:'Done',completed:true}} close={()=>{}} save={save}/>);
 fireEvent.click(screen.getByRole('button',{name:'Save'}));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({completed:true}));fireEvent.click(screen.getByRole('button',{name:'Mark unfinished'}));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({completed:false}));
});

