import React from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen,fireEvent} from '@testing-library/react';
import {Calculator} from './Calculator.js';
afterEach(cleanup);
it('calculates keyboard expressions, reports errors, and clears results',()=>{render(<Calculator en/>);const input=screen.getByRole('textbox',{name:'Expression'});fireEvent.change(input,{target:{value:'(12+8)*5'}});fireEvent.submit(input.closest('form')!);expect(screen.getByRole('status').textContent).toBe('100');fireEvent.change(input,{target:{value:'1/0'}});fireEvent.click(screen.getByRole('button',{name:'='}));expect(screen.getByRole('alert')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Clear'}));expect((input as HTMLInputElement).value).toBe('');});
