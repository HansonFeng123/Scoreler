import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {Toolbox,randomInteger} from './Toolbox.js';
import {exportStudyHtml} from './studyExport.js';
vi.mock('./studyExport.js',()=>({exportStudyHtml:vi.fn(async()=>{})}));
vi.mock('streamdown',()=>({Streamdown:({children}:any)=><p>{children}</p>}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
it('uses rejection sampling and includes both integer endpoints',()=>{
  const random=vi.spyOn(crypto,'getRandomValues').mockImplementationOnce((array:any)=>{array[0]=4294967295;return array;}).mockImplementationOnce((array:any)=>{array[0]=0;return array;}).mockImplementationOnce((array:any)=>{array[0]=9;return array;});
  expect(randomInteger(1,10)).toBe(1);expect(randomInteger(1,10)).toBe(10);expect(random).toHaveBeenCalledTimes(3);expect(()=>randomInteger(4,1)).toThrow();
});
it('requires multiple wheel choices and shows the selected result after spinning',()=>{
  vi.useFakeTimers();vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.spyOn(crypto,'getRandomValues').mockImplementation((array:any)=>{array[0]=1;return array;});
  render(<Toolbox locale="en" notice={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:/Spin wheel/}));
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'Only'}});expect((screen.getByRole('button',{name:'Spin'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'First\nSecond'}});fireEvent.click(screen.getByRole('button',{name:'Spin'}));
  expect((screen.getByRole('button',{name:'Spinning…'}) as HTMLButtonElement).disabled).toBe(true);
  // Finish the animation without relying on a transition event (reduced-motion compatible).
  act(()=>vi.runAllTimers());expect(screen.getByRole('status').textContent).toBe('Result: Second');
});
it('exports the editable Markdown preview as a PDF with a chosen filename',async()=>{
  Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
  render(<Toolbox locale="en" notice={vi.fn()}/>);fireEvent.click(screen.getByRole('button',{name:/Markdown to PDF/}));
  fireEvent.change(screen.getByRole('textbox',{name:'File name'}),{target:{value:'Chemistry'}});
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown'}),{target:{value:'# Atoms\nImportant facts'}});
  fireEvent.click(screen.getByRole('button',{name:'Export PDF'}));
  await waitFor(()=>expect(exportStudyHtml).toHaveBeenCalledWith(expect.stringContaining('Important facts'),'Chemistry','pdf'));
});

