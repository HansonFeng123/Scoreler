import React from 'react';import {it,expect,afterEach} from 'vitest';import {render,screen,cleanup} from '@testing-library/react';import {Encouragement,chooseEncouragement} from './Encouragement.js';
afterEach(()=>{cleanup();sessionStorage.clear();});
it('rotates on reopening without repeating the last saying',()=>{render(<Encouragement en/>);const first=screen.getByText(/✦/).closest('p')?.textContent;cleanup();render(<Encouragement en/>);expect(screen.getByText(/✦/).closest('p')?.textContent).not.toBe(first);});
it('excludes each previous index across random endpoints',()=>{for(let previous=0;previous<10;previous++){expect(chooseEncouragement(previous,()=>0)).not.toBe(previous);expect(chooseEncouragement(previous,()=>.99999)).not.toBe(previous);}});

