import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {ResizableChatInput} from './ResizableChatInput.js';
afterEach(cleanup);
it('expands upward with the drag handle, bounds its height, and resets',()=>{
  vi.stubGlobal('PointerEvent',MouseEvent);
  render(<ResizableChatInput locale="en" aria-label="Message" defaultValue="My draft"/>);
  const handle=screen.getByRole('button',{name:'Drag to resize message box'});
  Object.assign(handle,{setPointerCapture:vi.fn(),hasPointerCapture:()=>true,releasePointerCapture:vi.fn()});
  fireEvent.pointerDown(handle,{button:0,clientY:500});fireEvent.pointerMove(handle,{clientY:300});
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('278px');
  fireEvent.pointerUp(handle);fireEvent.pointerMove(handle,{clientY:100});
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('278px');
  fireEvent.doubleClick(handle);expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('78px');
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('My draft');
  vi.unstubAllGlobals();
});
it('supports keyboard resizing without submitting the message',()=>{render(<ResizableChatInput locale="zh-CN"/>);const h=screen.getByRole('button');fireEvent.keyDown(h,{key:'ArrowUp'});expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('102px');fireEvent.keyDown(h,{key:'Home'});expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('78px');});
