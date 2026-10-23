import {useEffect,useSyncExternalStore} from 'react';
import {apiFetch} from '../api/client.js';
import {appearanceState,type AppearanceState} from '../../../src/scoreler/appearance.js';
let snapshot={loaded:false,value:{selected:null,themes:[]} as AppearanceState};let loading:Promise<void>|null=null,queue=Promise.resolve();const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(f=>f());
function load(){if(!loading)loading=apiFetch<AppearanceState>('/api/student/appearance').then(value=>{snapshot={loaded:true,value:appearanceState(value)};emit();}).catch(()=>{snapshot={...snapshot,loaded:true};emit();});return loading;}
export function saveCustomThemes(value:AppearanceState){const clean=appearanceState(value);const action=queue.then(()=>apiFetch('/api/student/appearance',{method:'PUT',body:JSON.stringify(clean)})).then(()=>{snapshot={loaded:true,value:clean};emit();});queue=action.catch(()=>{});return action;}
export function useCustomThemes(){useEffect(()=>{void load();},[]);return useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},()=>snapshot,()=>snapshot);}
window.addEventListener('scoreler-preset-selected',()=>{void saveCustomThemes({...snapshot.value,selected:null}).catch(()=>{});});
