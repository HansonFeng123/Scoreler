import {appearanceState} from './appearance.js';
import {randomUUID} from 'node:crypto';
import {featureLayout} from './feature-layout.js';
import {generateDictation,gradeDictation,dictationHistory,deleteDictation,dictationCompletion,type DictationSheet} from './dictation.js';
import type {InnoConfig} from '../config.js';
import {capsules,addCapsule,deleteCapsule} from './capsules.js';
import {subjectFolders,addSubjectFolder} from './subject-folders.js';
import {permanentNoteLibrary,noteSubject,deleteLibraryNote} from './note-library.js';
import { readStudentMemory, saveStudentMemory, forgetStudentMemory } from './memory.js';
import {videoRecords,videoFile,cancelVideo,deleteVideo} from './videos.js';
import {createReadStream} from 'node:fs';
import { renameDrawing, saveDrawing, loadDrawing, listWorkspace, uploadWorkspaceFile, createWorkspaceDirectory, resolveStudyItem, canOpenStudyFile } from './workspace.js';
import { readFile, stat } from 'node:fs/promises';
import { extname, basename, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { importStudyDocument, waitForIndexing, authorizeStudyFolder, scanStudyFolders } from './library.js';
import { studentStore, StudentError, type StudyEvent, type Mistake, type PracticeTest } from './store.js';
import { json, readBody } from '../server/http-helpers.js';

export async function handleStudentRoutes(req: IncomingMessage, res: ServerResponse, method: string, url: string, dataDir: string, getConfig?:()=>InnoConfig) {
  if (!url.startsWith('/api/student/')) return false;
  const store = studentStore(dataDir);
  const pathname = url.split('?')[0];
  const body = async () => await readBody(req, { maxBytes: 30 * 1024 * 1024 }) as Record<string, unknown>;
  try {
    if(pathname==='/api/student/appearance'&&method==='GET'){json(res,200,store.get('meta','appearance')||{selected:null,themes:[]});
    }else if(pathname==='/api/student/appearance'&&method==='PUT'){const value=appearanceState(await body());store.put('meta',{id:'appearance',...value});json(res,200,value);
    }else if(pathname==='/api/student/feature-layout'&&method==='GET'){json(res,200,featureLayout(store.get('meta','feature-layout')));
    }else if(pathname==='/api/student/feature-layout'&&method==='PUT'){const layout=featureLayout(await body());store.put('meta',{id:'feature-layout',...layout});json(res,200,layout);
    }else if(pathname==='/api/student/dictations'&&method==='GET'){json(res,200,store.list<DictationSheet>('dictations').reverse());
    }else if(/^\/api\/student\/dictations\/[a-f0-9-]+\/draft$/.test(pathname)&&method==='PUT'){const id=pathname.split('/')[4],b=await body(),sheet=store.get<DictationSheet>('dictations',id);if(!sheet||!Array.isArray(b.answers)||b.answers.length!==sheet.items.length||b.answers.some(a=>typeof a!=='string'||a.length>4000))throw new StudentError('Invalid draft');store.put('dictations',{...sheet,draftAnswers:b.answers});json(res,200,{saved:true});
    }else if(/^\/api\/student\/dictations\/[a-f0-9-]+\/history$/.test(pathname)&&method==='GET'){json(res,200,dictationHistory(dataDir,pathname.split('/')[4]));
    }else if(/^\/api\/student\/dictations\/[a-f0-9-]+$/.test(pathname)&&method==='DELETE'){json(res,200,deleteDictation(dataDir,pathname.split('/')[4]));
    }else if(/^\/api\/student\/dictations\/[a-f0-9-]+$/.test(pathname)&&method==='PUT'){const id=pathname.split('/')[4],sheet=store.get<DictationSheet>('dictations',id),b=await body();if(!sheet||typeof b.subject!=='string'||b.subject.length>80)throw new StudentError('Invalid subject');store.put('dictations',{...sheet,subject:b.subject.trim()});json(res,200,store.get('dictations',id));
    }else if(pathname==='/api/student/chat-attachment'&&method==='POST'){const b=await body();if(typeof b.name!=='string'||typeof b.data!=='string')throw new StudentError('Missing document');const doc=await importStudyDocument(dataDir,{name:b.name,data:Buffer.from(b.data,'base64'),source:'Chat uploads/'+randomUUID()+'/'+b.name});await waitForIndexing(dataDir);const indexed=store.get<{id:string;name:string;status:string;error?:string}>('documents',doc.id);if(indexed?.status!=='ready')throw new StudentError(indexed?.error||'Unable to read this file');json(res,201,{id:indexed.id,name:indexed.name});
    }else if(pathname==='/api/student/dictations'&&method==='POST'){if(!getConfig)throw new StudentError('Model configuration unavailable');json(res,201,await generateDictation(dataDir,await body(),prompt=>dictationCompletion(getConfig(),prompt)));
    }else if(/^\/api\/student\/dictations\/[a-f0-9-]+\/submit$/.test(pathname)&&method==='POST'){if(!getConfig)throw new StudentError('Model configuration unavailable');const b=await body();json(res,200,await gradeDictation(dataDir,pathname.split('/')[4],b.answers,prompt=>dictationCompletion(getConfig(),prompt)));
    }else if(pathname==='/api/student/subject-folders'&&method==='GET'){json(res,200,subjectFolders(dataDir,new URL(url,'http://localhost').searchParams.get('kind')));
    }else if(pathname==='/api/student/subject-folders'&&method==='POST'){const b=await body();if(b.kind==='notes')await noteSubject(dataDir,String(b.name??''));json(res,201,addSubjectFolder(dataDir,b.kind,b.name));
    }else if(pathname==='/api/student/capsules'&&method==='GET'){json(res,200,capsules(dataDir));
    }else if(pathname==='/api/student/capsules'&&method==='POST'){const b=await body();json(res,201,addCapsule(dataDir,b.text));
    }else if(pathname.startsWith('/api/student/capsules/')&&method==='DELETE'){json(res,200,deleteCapsule(dataDir,decodeURIComponent(pathname.split('/').pop()!)));
    }else if(pathname==='/api/student/notes'&&method==='GET'){json(res,200,await permanentNoteLibrary(dataDir));
    }else if(pathname==='/api/student/notes'&&method==='POST'){const b=await body();json(res,201,await noteSubject(dataDir,String(b.subject??'')));
    }else if(pathname==='/api/student/notes'&&method==='DELETE'){const b=await body();json(res,200,await deleteLibraryNote(dataDir,String(b.folderId??''),String(b.path??'')));
    }else if(method==='DELETE'&&/^\/api\/student\/videos\/[a-f0-9-]+$/.test(pathname)){json(res,200,deleteVideo(dataDir,pathname.split('/')[4]));
    }else if(pathname==='/api/student/workspace/drawing'&&(method==='GET'||method==='PUT')){
      if(method==='GET'){const q=new URL(url,'http://localhost').searchParams;json(res,200,await loadDrawing(dataDir,q.get('folderId')??'',q.get('path')??''));}
      else{const b=await body();if(typeof b.folderId!=='string'||typeof b.path!=='string')throw new StudentError('Choose a workspace file');if(typeof b.previousPath==='string'&&b.previousPath!==b.path){await saveDrawing(dataDir,b.folderId,b.previousPath,b.note,false);json(res,200,await renameDrawing(dataDir,b.folderId,b.previousPath,b.path));}else json(res,200,await saveDrawing(dataDir,b.folderId,b.path,b.note,b.create===true));}
    } else if(method==='GET'&&/^\/api\/student\/videos\/[a-f0-9-]+\/(media|poster|lesson)$/.test(pathname)){
      const parts=pathname.split('/'),id=parts[4],kind=parts[5];const path=videoFile(dataDir,id,kind==='poster'?'poster':kind==='lesson'?'lesson':'mp4');const info=await stat(path);
      const headers:Record<string,string|number>={'Content-Type':kind==='poster'?'image/jpeg':kind==='lesson'?'application/json':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'};
      if(new URL(url,'http://localhost').searchParams.has('download'))headers['Content-Disposition']=`attachment; filename="Scoreler-${id}.${kind==='lesson'?'json':'mp4'}"`;
      const range=req.headers.range;if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);let start=m?.[1]?Number(m[1]):0,end=m?.[2]?Number(m[2]):info.size-1;if(m&&!m[1]&&m[2]){start=Math.max(0,info.size-Number(m[2]));end=info.size-1;}end=Math.min(end,info.size-1);if(!m||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return true;}res.writeHead(206,{...headers,'Content-Range':`bytes ${start}-${end}/${info.size}`,'Content-Length':end-start+1});createReadStream(path,{start,end}).pipe(res);}else{res.writeHead(200,{...headers,'Content-Length':info.size});createReadStream(path).pipe(res);}
    } else if(method==='POST'&&/^\/api\/student\/videos\/[a-f0-9-]+\/cancel$/.test(pathname)){
      json(res,200,cancelVideo(dataDir,pathname.split('/')[4]));
    } else if(method==='GET'&&pathname==='/api/student/videos'){
      json(res,200,videoRecords(dataDir));
    } else if(method==='GET'&&pathname.startsWith('/api/student/mistake-images/')){
      const id=pathname.split('/').pop()!;if(!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(id))throw new StudentError('Invalid screenshot');const ext=extname(id).slice(1);res.writeHead(200,{'Content-Type':ext==='jpg'?'image/jpeg':`image/${ext}`,'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'});res.end(await readFile(join(dataDir,'mistake-images',id)));
    } else if (method === 'GET' && pathname === '/api/student/memory') {
      json(res,200,readStudentMemory(dataDir));
    } else if (method === 'PUT' && pathname === '/api/student/memory') {
      const b=await body();json(res,200,saveStudentMemory(dataDir,String(b.key??''),String(b.value??'')));
    } else if (method === 'DELETE' && pathname === '/api/student/memory') {
      const b=await body();json(res,200,forgetStudentMemory(dataDir,String(b.key??'')));
    } else if (method === 'GET' && pathname === '/api/student/workspace') {
      const params=new URL(url,'http://localhost').searchParams;json(res,200,await listWorkspace(dataDir,params.get('folderId')??undefined,params.get('path')??''));
    } else if (method === 'POST' && pathname === '/api/student/workspace/upload') {
      const b=await body();json(res,201,await uploadWorkspaceFile(dataDir,String(b.folderId??''),String(b.path??''),String(b.name??''),Buffer.from(String(b.data??''),'base64')));
    } else if (method === 'POST' && pathname === '/api/student/workspace/directory') {
      const b=await body();json(res,201,await createWorkspaceDirectory(dataDir,String(b.folderId??''),String(b.path??''),String(b.name??'')));
    } else if (method === 'POST' && pathname === '/api/student/workspace/resolve') {
      if(!process.env.SCORELER_DESKTOP_TOKEN||req.headers['x-scoreler-desktop-token']!==process.env.SCORELER_DESKTOP_TOKEN){json(res,403,{error:'Use desktop Open'});return true;}
      const b=await body();const path=await resolveStudyItem(dataDir,b as {folderId?:string;path?:string;documentId?:string});const directory=(await stat(path)).isDirectory();if(!directory&&!canOpenStudyFile(path))throw new StudentError('This file type cannot be launched from Scoreler');json(res,200,{path});
    } else if (method === 'GET' && pathname === '/api/student/workspace/content') {
      const params=new URL(url,'http://localhost').searchParams;const path=await resolveStudyItem(dataDir,{folderId:params.get('folderId')??undefined,path:params.get('path')??undefined,documentId:params.get('documentId')??undefined});const info=await stat(path);if(!info.isFile()||info.size>20*1024*1024)throw new StudentError('File cannot be previewed');const types:Record<string,string>={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.csv':'text/plain; charset=utf-8','.json':'text/plain; charset=utf-8'};const type=types[extname(path).toLowerCase()];res.writeHead(200,{'Content-Type':type??'application/octet-stream','Content-Disposition':`${type?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(basename(path))}`,'Content-Security-Policy':"sandbox; default-src 'none'",'X-Content-Type-Options':'nosniff'});res.end(await readFile(path));
    } else if (method === 'GET' && pathname === '/api/student/state') {
      json(res, 200, { videos:videoRecords(dataDir),events: store.list<StudyEvent>('events'), mistakes: store.list<Mistake>('mistakes'), exams: store.list<PracticeTest>('exams'), documents: store.list('documents'), preferences: store.preferences(), folders: store.list("folders"), plans: store.list("plans"), activity: store.activity() });
    } else if (method === 'POST' && pathname.startsWith('/api/student/plans/')) {
      json(res,200,store.applyPlan(decodeURIComponent(pathname.split('/').pop()!)));
    } else if (method === 'DELETE' && pathname.startsWith('/api/student/plans/')) {
      store.discardPlan(decodeURIComponent(pathname.split('/').pop()!)); json(res,200,{ok:true});
    } else if (method === 'GET' && pathname === '/api/student/export') {
      json(res, 200, {...store.export(),memory:readStudentMemory(dataDir)});
    } else if (method === 'PUT' && pathname === '/api/student/preferences') {
      json(res, 200, store.setPreferences(await body()));
    } else if (method === 'POST' && pathname === '/api/student/undo') {
      store.undo(); json(res, 200, { ok: true });
    } else if ((method === 'POST' || method === 'PUT') && pathname === '/api/student/events') {
      const b = await body();
      if (method === 'PUT' && (typeof b.id !== 'string' || !store.get('events', b.id))) throw new StudentError('Event not found');
      json(res, 200, store.saveEvent(b, typeof b.id === 'string' ? b.id : undefined));
    } else if (method === 'DELETE' && pathname.startsWith('/api/student/events/')) {
      store.deleteEvent(decodeURIComponent(pathname.split('/').pop()!)); json(res, 200, { ok: true });
    } else if ((method === 'POST' || method === 'PUT') && pathname === '/api/student/mistakes') {
      const b = await body(); json(res, 200, store.saveMistake(b, typeof b.id === 'string' ? b.id : undefined));
    } else if (method === 'DELETE' && pathname.startsWith('/api/student/mistakes/')) {
      store.remove('mistakes', decodeURIComponent(pathname.split('/').pop()!)); json(res, 200, { ok: true });
    } else if (method === 'GET' && pathname === '/api/student/search') {
      json(res, 200, store.search(new URL(url, 'http://localhost').searchParams.get('q') ?? ''));
    } else if (method === 'POST' && pathname === '/api/student/documents') {
      const b = await body();
      if (typeof b.name !== 'string' || typeof b.data !== 'string') throw new StudentError('Missing document');
      json(res,202,await importStudyDocument(dataDir,{name:b.name,data:Buffer.from(b.data,'base64'),source:typeof b.relativePath==='string'?b.relativePath:b.name}));
    } else if (method === 'POST' && pathname === '/api/student/folders/authorize') {
      if (!process.env.SCORELER_DESKTOP_TOKEN || req.headers['x-scoreler-desktop-token'] !== process.env.SCORELER_DESKTOP_TOKEN) { json(res,403,{error:'Use the desktop folder picker'}); return true; }
      const b=await body(); if(typeof b.path!=='string')throw new StudentError('Missing folder');
      const folder=await authorizeStudyFolder(dataDir,b.path);void scanStudyFolders(dataDir);json(res,200,folder);
    } else if (method === 'POST' && pathname === '/api/student/folders/rescan') {
      void scanStudyFolders(dataDir);json(res,202,{ok:true});
    } else if (method === 'DELETE' && pathname.startsWith('/api/student/folders/')) {
      const id=decodeURIComponent(pathname.split('/').pop()!);const folder=store.get<{id:string;enabled:boolean}>('folders',id);
      if(!folder)throw new StudentError('Folder not found');store.put('folders',{...folder,enabled:false});json(res,200,{ok:true});
    } else if (method === 'DELETE' && pathname.startsWith('/api/student/exams/')) {
      store.deleteExam(decodeURIComponent(pathname.split('/').pop()!));json(res,200,{ok:true});
    } else if (method === 'PUT' && pathname.startsWith('/api/student/attempts/')) {
      const id = decodeURIComponent(pathname.split('/').pop()!);
      const exam = store.get<PracticeTest>('exams',id); if (!exam) throw new StudentError('Assessment not found');
      const b = await body();
      if (!Array.isArray(b.answers) || b.answers.length !== exam.questions.length || b.answers.some(a => typeof a !== 'string' || a.length > 20000)) throw new StudentError('Invalid answers');
      json(res,200,store.put('attempts',{ id, answers:b.answers, submitted:b.submitted === true, updatedAt:new Date().toISOString() }));
    } else if (method === 'GET' && pathname.startsWith('/api/student/attempts/')) {
      const id=decodeURIComponent(pathname.split('/').pop()!);
      const exam=store.get<PracticeTest>('exams',id);if(!exam)throw new StudentError('Assessment not found');
      json(res,200,store.get('attempts',id) ?? {id,answers:exam.questions.map(()=>''),submitted:false});
    } else { json(res,404,{ error:'Not found' }); }
  } catch (error) {
    if (error instanceof StudentError) json(res,400,{ error:error.message }); else throw error;
  }
  return true;
}

