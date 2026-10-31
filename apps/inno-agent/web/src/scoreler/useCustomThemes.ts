import {useEffect,useSyncExternalStore} from 'react';
import {apiFetch} from '../api/client.js';
import {appearanceState,type AppearanceState} from '../../../src/scoreler/appearance.js';
let snapshot={loaded:false,value:{selected:null,themes:[]} as AppearanceState};let loading:Promise<void>|null=null,queue=Promise.resolve();const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(f=>f());
function load(){if(!loading)loading=apiFetch<AppearanceState>('/api/student/appearance').then(value=>{snapshot={loaded:true,value:appearanceState(value)};emit();}).catch(()=>{loading=null;snapshot={...snapshot,loaded:false};emit();});return loading;}
export function saveCustomThemes(value:AppearanceState){if(!snapshot.loaded)return Promise.reject(new Error('Appearance has not loaded. Existing themes were preserved.'));const clean=appearanceState(value);const action=queue.then(()=>apiFetch('/api/student/appearance',{method:'PUT',body:JSON.stringify(clean)})).then(()=>{snapshot={loaded:true,value:clean};emit();});queue=action.catch(()=>{});return action;}
export function useCustomThemes(){useEffect(()=>{void load();const retry=()=>{if(!snapshot.loaded)void load();};window.addEventListener('focus',retry);return()=>window.removeEventListener('focus',retry);},[]);return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>snapshot,()=>snapshot);}
window.addEventListener('scoreler-preset-selected',()=>{if(!snapshot.loaded)return;void saveCustomThemes({...snapshot.value,selected:null}).catch(()=>{});});
