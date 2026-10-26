import {randomUUID} from 'node:crypto';
import {studentStore,StudentError} from './store.js';
export type SubjectFolderKind='notes'|'videos'|'exams'|'mistakes'|'dictations';
export interface SubjectFolder{id:string;kind:SubjectFolderKind;name:string;createdAt:string}
function kind(value:unknown):SubjectFolderKind{if(!['notes','videos','exams','mistakes','dictations'].includes(String(value)))throw new StudentError('Choose a library');return value as SubjectFolderKind;}
export function subjectFolders(directory:string,library:unknown){const k=kind(library);return studentStore(directory).list<SubjectFolder>('subject-folders').filter(f=>f.kind===k);}
export function addSubjectFolder(directory:string,library:unknown,value:unknown){
 const k=kind(library);if(typeof value!=='string'||!value.trim()||value.trim().length>80||/[\\/:*?"<>|\x00-\x1f]/.test(value)||['.','..'].includes(value.trim()))throw new StudentError('Use a folder name of 1–80 characters without path symbols');
 const name=value.trim(),existing=subjectFolders(directory,k).find(f=>f.name.toLocaleLowerCase()===name.toLocaleLowerCase());if(existing)return existing;
 return studentStore(directory).put<SubjectFolder>('subject-folders',{id:randomUUID(),kind:k,name,createdAt:new Date().toISOString()});
}
