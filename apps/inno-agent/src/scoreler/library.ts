import JSZip from 'jszip';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, stat, realpath } from 'node:fs/promises';
import { basename, extname, join, relative, isAbsolute, posix } from 'node:path';
import { studentStore, StudentError } from './store.js';
import { parseDocument } from '../memory/l2/document-parser.js';

export interface LibraryDocument { id:string; name:string; source:string; hash:string; size:number; status:'indexing'|'ready'|'error'; folderId?:string; relativePath?:string; pages?:number; citationKind?:'page'|'section'; indexedAt?:string|null; error?:string; modifiedMs?:number }
export interface AuthorizedFolder { id:string; path:string; name:string; enabled:boolean; lastScan?:string; error?:string }
const extensions=new Set(['.pdf','.docx','.txt','.md','.csv','.json','.xlsx','.pptx']);
export const supportsStudyFile=(name:string)=>extensions.has(extname(name).toLowerCase());
const queues=new Map<string,Promise<void>>();

export async function importStudyDocument(dataDir:string, input:{name:string;data:Buffer;source:string;folderId?:string;relativePath?:string;modifiedMs?:number}):Promise<LibraryDocument> {
 const store=studentStore(dataDir);
 const name=basename(input.name.replaceAll('\\','/')).slice(0,200),ext=extname(name).toLowerCase();
 if(!extensions.has(ext))throw new StudentError('Supported: PDF, DOCX, XLSX, PPTX, Markdown, text, CSV, JSON');
 if(input.data.length>20*1024*1024)throw new StudentError('File limit: 20 MB');
 const hash=createHash('sha256').update(input.data).digest('hex');
 const old=store.findDocument<LibraryDocument>(input.source,input.folderId,input.relativePath);
 if(old?.hash===hash&&old.status==='ready')return store.put('documents',{...old,modifiedMs:input.modifiedMs??old.modifiedMs});
 const id=old?.id??randomUUID();
 const doc:LibraryDocument={id,name,source:input.source.slice(0,1000),hash,size:input.data.length,status:'indexing',folderId:input.folderId,relativePath:input.relativePath,indexedAt:null,modifiedMs:input.modifiedMs};
 store.put('documents',doc);
 store.indexDocument(id,doc.source,[]);
 // Serialize import/index jobs to prevent stale results from overwriting a changed document.
 const previous=queues.get(dataDir)??Promise.resolve();
 const data=Buffer.from(input.data);
 const next=previous.catch(()=>{}).then(async()=>{
  try {
   const directory=join(dataDir,'study-materials');await mkdir(directory,{recursive:true});
   const filePath=join(directory,`${id}${ext}`);await writeFile(filePath,data);
   const pages=await extractStudyPages(filePath,data);
   if(!pages.some(p=>p.text.trim()))throw new Error('No readable text found. Scanned PDFs require OCR.');
   const current=store.get<LibraryDocument>('documents',id);
   if(!current||current.hash!==hash)return;
   store.indexDocument(id,doc.source,pages);
   store.put('documents',{...doc,status:'ready',pages:ext==='.pdf'?pages.length:undefined,citationKind:ext==='.pdf'?'page':'section',indexedAt:new Date().toISOString()});
  }catch(error){const current=store.get<LibraryDocument>('documents',id);if(current?.hash===hash)store.put('documents',{...doc,status:'error',error:error instanceof Error?error.message:'Indexing failed'});}
 });
 queues.set(dataDir,next);void next.finally(()=>{if(queues.get(dataDir)===next)queues.delete(dataDir);});
 return doc;
}
export async function waitForIndexing(dataDir:string){await queues.get(dataDir);}

export async function authorizeStudyFolder(dataDir:string,requested:string){
 const path=await realpath(requested);
 if(!(await stat(path)).isDirectory())throw new StudentError('Choose a directory');
 const store=studentStore(dataDir);
 const existing=store.list<AuthorizedFolder>('folders').find(f=>f.path===path);
 return store.put<AuthorizedFolder>('folders',{id:existing?.id??randomUUID(),path,name:basename(path),enabled:true});
}
const scanning=new Map<string,Promise<void>>();
export function scanStudyFolders(dataDir:string):Promise<void>{
 const running=scanning.get(dataDir);if(running)return running;
 const operation=(async()=>{
  const store=studentStore(dataDir);
  for(const folder of store.list<AuthorizedFolder>('folders').filter(f=>f.enabled)){
   const found=new Set<string>();
   try{
    const root=await realpath(folder.path);
    const visit=async(directory:string)=>{
     for(const entry of await readdir(directory,{withFileTypes:true})){
      if(entry.isSymbolicLink()||['.git','node_modules','.cache'].includes(entry.name))continue;
      const path=join(directory,entry.name),resolved=await realpath(path),rel=relative(root,resolved);
      if(!rel||rel.startsWith('..')||isAbsolute(rel))continue;
      if(entry.isDirectory()){await visit(resolved);continue;}
      if(!entry.isFile()||!supportsStudyFile(entry.name))continue;
      const key=rel.replaceAll('\\','/');found.add(key);
      const info=await stat(resolved);
      if(info.size>20*1024*1024)continue;
      const prior=store.findDocument<LibraryDocument>('',folder.id,key);
      if(prior&&prior.modifiedMs===info.mtimeMs&&prior.size===info.size&&prior.status!=='indexing')continue;
      const data=await readFile(resolved);
      await importStudyDocument(dataDir,{name:entry.name,data,source:`${folder.name}/${key}`,folderId:folder.id,relativePath:key,modifiedMs:info.mtimeMs});
      await waitForIndexing(dataDir);
     }
    };
    await visit(root);
    // Prune only after a successful complete scan. An inaccessible root must never look like deletions.
    for(const doc of store.list<LibraryDocument>('documents').filter(d=>d.folderId===folder.id))if(!found.has(doc.relativePath??'')){store.removeDocument(doc.id);}
    store.put('folders',{...folder,lastScan:new Date().toISOString(),error:undefined});
   }catch(error){store.put('folders',{...folder,error:error instanceof Error?error.message:'Folder scan failed'});}
  }
 })().finally(()=>scanning.delete(dataDir));scanning.set(dataDir,operation);return operation;
}
export function monitorStudyFolders(dataDir:string){void scanStudyFolders(dataDir);const timer=setInterval(()=>void scanStudyFolders(dataDir),30000);timer.unref();return()=>clearInterval(timer);}

function xmlText(value:string){return value.replace(/<[^>]*>/g,'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n:string)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c<=0x10ffff?String.fromCodePoint(c):'';}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
export async function extractStudyPages(filePath:string,data:Buffer):Promise<Array<{pageNumber:number;text:string}>> {
 const ext=extname(filePath).toLowerCase();
 if(ext==='.docx'){const mammoth=await import('mammoth');return [{pageNumber:0,text:(await mammoth.extractRawText({buffer:data})).value}];}
 if(['.txt','.md','.csv','.json'].includes(ext))return [{pageNumber:0,text:data.toString('utf8')}];
 if(ext==='.xlsx'||ext==='.pptx'){
  const zip=await JSZip.loadAsync(data);let total=0;for(const entry of Object.values(zip.files)){const size=(entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0;total+=size;if(size>20*1024*1024||total>100*1024*1024)throw new StudentError('Office document expands beyond the reading limit');}
  const read=async(name:string)=>await zip.file(name)?.async('string')??'';
  if(ext==='.pptx'){const files=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));return Promise.all(files.map(async(name,index)=>({pageNumber:index+1,text:[...(await read(name)).matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m=>xmlText(m[1])).join('\n')})));}
  const shared=[...(await read('xl/sharedStrings.xml')).matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join(''));
  const workbook=await read('xl/workbook.xml');const relationships=await read('xl/_rels/workbook.xml.rels');
  const attr=(tag:string,name:string)=>xmlText(tag.match(new RegExp('(?:^|\\s)'+name+'="([^"]+)"'))?.[1]??'');
  const targets=new Map([...relationships.matchAll(/<Relationship\b[^>]*>/g)].map(m=>[attr(m[0],'Id'),attr(m[0],'Target')]));
  const sheets=[...workbook.matchAll(/<sheet\b[^>]*>/g)].map(m=>({name:attr(m[0],'name'),target:targets.get(attr(m[0],'r:id'))??''})).filter(s=>s.target);
  const names=sheets.map(s=>s.name);const files=sheets.length?sheets.map(s=>posix.normalize(s.target.startsWith('/')?s.target.slice(1):'xl/'+s.target)):Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));return Promise.all(files.map(async(name,index)=>{const xml=await read(name);const rows=[...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(row=>[...row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)].map(c=>{const ref=c[1].match(/\br="([^"]+)"/)?.[1]??'';const raw=c[2].match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1];const value=/\bt="s"/.test(c[1])?shared[Number(raw)]??'':raw!==undefined?xmlText(raw):[...c[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t=>xmlText(t[1])).join('');return `${ref}: ${value}`;}).join(' | '));return {pageNumber:0,text:`Sheet: ${names[index]??basename(name)}\n${rows.join('\n')}`};}));
 }
 return (await parseDocument(filePath)).pages;
}
