import {randomUUID} from 'node:crypto';import {studentStore,StudentError} from './store.js';
export interface MemoryCapsule{id:string;text:string;createdAt:string}
export function capsules(directory:string){return studentStore(directory).list<MemoryCapsule>('capsules').sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export function addCapsule(directory:string,text:unknown){if(typeof text!=='string'||!text.trim()||text.trim().length>500)throw new StudentError('Use 1–500 characters for a capsule');return studentStore(directory).put<MemoryCapsule>('capsules',{id:randomUUID(),text:text.trim(),createdAt:new Date().toISOString()});}
export function deleteCapsule(directory:string,id:string){const store=studentStore(directory);if(!store.get('capsules',id))throw new StudentError('Memory capsule not found');store.remove('capsules',id);return {ok:true};}
