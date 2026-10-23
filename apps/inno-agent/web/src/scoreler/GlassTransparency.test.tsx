import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {GlassTransparency} from './GlassTransparency.js';
import {saveCustomThemes} from './useCustomThemes.js';
vi.mock('./useCustomThemes.js',()=>({useCustomThemes:()=>({loaded:true,value:{selected:'saved',themes:[{id:'saved',name:'Saved picture',background:'#ffffff',accent:'#000000'}],glassTransparency:14}}),saveCustomThemes:vi.fn().mockResolvedValue(undefined)}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('previews the slider immediately and saves the setting without discarding the selected theme',()=>{
 const preview=vi.fn();window.addEventListener('scoreler-glass-preview',preview);
 render(<GlassTransparency en notice={()=>{}}/>);const slider=screen.getByRole('slider',{name:'Glass transparency'});
 fireEvent.change(slider,{target:{value:'30'}});expect(screen.getByText('30%')).toBeTruthy();expect(preview).toHaveBeenCalledTimes(1);
 fireEvent.pointerUp(slider);expect(saveCustomThemes).toHaveBeenCalledWith(expect.objectContaining({glassTransparency:30,selected:'saved',themes:expect.arrayContaining([expect.objectContaining({id:'saved'})])}));
 window.removeEventListener('scoreler-glass-preview',preview);
});
