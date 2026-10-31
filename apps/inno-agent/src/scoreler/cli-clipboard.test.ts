import {it,expect} from 'vitest';
import {mkdtemp,readFile,writeFile,access,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ClipboardImages} from './cli-clipboard.js';
it('pastes a screenshot path, attaches only referenced images, redacts the local path and cleans its own files',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scoreler-paste-')),store=new ClipboardImages(dir),bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 try{const result=await store.paste({getImage:async()=>bytes,getText:async()=>null},'');expect(result?.image).toBe(true);const path=store.referenced(result!.text)[0].path;expect(await readFile(path)).toEqual(bytes);expect(store.referenced('removed')).toEqual([]);expect(store.redactPaths('explain '+result!.text)).not.toContain(dir);await expect(store.paste({getImage:async()=>bytes,getText:async()=>null},'',5)).rejects.toThrow('five');await store.close();await expect(access(path)).rejects.toThrow();}finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
it('pastes a copied image file path without deleting the original and falls back to ordinary clipboard text',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'scoreler-paste-')),store=new ClipboardImages(dir);
 try{const original=join(dir,'题目.png');await writeFile(original,Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));const copied=await store.paste({getImage:async()=>null,getText:async()=>null,getFilePaths:async()=>[original]},'');expect(copied?.image).toBe(true);await store.close();await expect(access(original)).resolves.toBeUndefined();const result=await store.paste({getImage:async()=>null,getText:async()=> '中文问题'},'');expect(result).toEqual({text:'中文问题',image:false});await expect(store.paste(undefined,'')).rejects.toThrow('unavailable');}finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
