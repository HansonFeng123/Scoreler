import React from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,act} from '@testing-library/react';
import {TimeTools} from './TimeTools.js';
import {pauseTimer,resetTimer,resetStopwatch} from './studyClock.js';
afterEach(()=>{pauseTimer();resetTimer();resetStopwatch();cleanup();vi.useRealTimers();});
it('counts down across navigation, pauses accurately and finishes once in the background',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
 const done=vi.fn();window.addEventListener('scoreler-timer-finished',done);
 const view=render(<TimeTools en mode="timer"/>);
 fireEvent.change(screen.getByRole('spinbutton',{name:'Minutes'}),{target:{value:'0'}});
 fireEvent.change(screen.getByRole('spinbutton',{name:'Seconds'}),{target:{value:'5'}});
 fireEvent.click(screen.getByRole('button',{name:'Start'}));
 act(()=>vi.advanceTimersByTime(2000));expect(screen.getByRole('timer').textContent).toBe('00:00:03');
 fireEvent.click(screen.getByRole('button',{name:'Pause'}));act(()=>vi.advanceTimersByTime(5000));expect(screen.getByRole('timer').textContent).toBe('00:00:03');
 fireEvent.click(screen.getByRole('button',{name:'Start'}));view.unmount();
 act(()=>vi.advanceTimersByTime(3000));expect(done).toHaveBeenCalledTimes(1);
 render(<TimeTools en mode="timer"/>);expect(screen.getByRole('timer').textContent).toBe('00:00:00');
 act(()=>vi.advanceTimersByTime(10000));expect(done).toHaveBeenCalledTimes(1);window.removeEventListener('scoreler-timer-finished',done);
});
it('keeps stopwatch elapsed time across navigation and supports pause and reset',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-21T06:00:00Z'));
 const view=render(<TimeTools en mode="stopwatch"/>);fireEvent.click(screen.getByRole('button',{name:'Start'}));
 act(()=>vi.advanceTimersByTime(1250));view.unmount();act(()=>vi.advanceTimersByTime(2000));
 render(<TimeTools en mode="stopwatch"/>);expect(screen.getByRole('timer').textContent).toBe('00:00:03.2');
 fireEvent.click(screen.getByRole('button',{name:'Pause'}));act(()=>vi.advanceTimersByTime(1000));expect(screen.getByRole('timer').textContent).toBe('00:00:03.2');
 fireEvent.click(screen.getByRole('button',{name:'Reset'}));expect(screen.getByRole('timer').textContent).toBe('00:00:00.0');
});
