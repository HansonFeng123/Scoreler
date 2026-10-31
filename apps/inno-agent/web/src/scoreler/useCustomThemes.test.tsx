import {it,expect,vi} from 'vitest';
import {act,renderHook,cleanup} from '@testing-library/react';
import {apiFetch} from '../api/client.js';
import {useCustomThemes,saveCustomThemes} from './useCustomThemes.js';
vi.mock('../api/client.js',()=>({apiFetch:vi.fn()}));

it('preserves unloaded appearance after failure, blocks writes, and retries on focus',async()=>{
 const saved={selected:'saved-theme',themes:[{id:'saved-theme',name:'Saved theme',background:'#f3f6f2',accent:'#507c66'}],glassTransparency:20};
 vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(saved);
 const hook=renderHook(()=>useCustomThemes());
 await act(async()=>{});
 expect(hook.result.current.loaded).toBe(false);
 await expect(saveCustomThemes({selected:null,themes:[]})).rejects.toThrow('Appearance has not loaded');
 await act(async()=>{window.dispatchEvent(new Event('scoreler-preset-selected'));});
 expect(apiFetch).toHaveBeenCalledTimes(1);
 await act(async()=>{window.dispatchEvent(new Event('focus'));});
 expect(hook.result.current.loaded).toBe(true);
 expect(hook.result.current.value).toEqual(saved);
 expect(apiFetch).toHaveBeenCalledTimes(2);
 cleanup();
});
