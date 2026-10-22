import {it,expect} from 'vitest';
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {addSubjectFolder,subjectFolders} from './subject-folders.js';
import {studentStore} from './store.js';
it('persists empty folders per library and prevents path names and duplicate categories',()=>{
 const dir=mkdtempSync(join(tmpdir(),'scoreler-subject-folders-'));
 const created=addSubjectFolder(dir,'notes',' Biology ');expect(created.name).toBe('Biology');
 expect(addSubjectFolder(dir,'notes','biology').id).toBe(created.id);
 expect(subjectFolders(dir,'notes')).toHaveLength(1);expect(subjectFolders(dir,'videos')).toHaveLength(0);
 expect(()=>addSubjectFolder(dir,'notes','../outside')).toThrow();expect(()=>addSubjectFolder(dir,'bad','Biology')).toThrow();
 studentStore(dir).close();
});
