import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDictationTools} from './dictation-tools.js';
import {studentStore} from './store.js';
import type {DictationSheet} from './dictation.js';
it('saves source definitions through the agent tool and exposes a working shortcut without the answer key',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scoreler-dictation-tools-'));
 try{
  const tools=createDictationTools(dir);
  const result=await (tools[0].execute as any)('call-1',{title:'Example vocabulary',entries:[{word:'abundant',definition:'present in large quantities',source:'Example.txt'}]});
  const savedResult=JSON.parse(result.content[0].text);
  const links=[{id:savedResult.dictationId}];
  expect(savedResult.saved).toBe(true);
  expect(links[0].id).toMatch(/^[a-f0-9-]{36}$/);
  const saved=studentStore(dir).get<DictationSheet>('dictations',links[0].id);
  expect(saved?.items[0].answer).toBe('present in large quantities');
  expect(saved?.items[0].prompt).toBe('abundant');
  expect(JSON.stringify(result)).not.toContain('present in large quantities');
  const listing=await (tools[1].execute as any)('call-2',{});
  expect(JSON.stringify(listing)).toContain(links[0].id);
 }finally{studentStore(dir).close();rmSync(dir,{recursive:true,force:true});}
});
