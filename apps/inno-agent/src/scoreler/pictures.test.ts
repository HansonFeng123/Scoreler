import {it,expect} from 'vitest';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createCanvas} from '@napi-rs/canvas';
import {validatePicture,insertPicture} from './pictures.js';
import {authorizeStudyFolder} from './library.js';
import {createNote,readNote} from './notes.js';
it('validates diagram bounds and references without accepting arbitrary code',()=>{const p={title:'Atom',nodes:[{id:'a',label:'Proton',x:50,y:100}],edges:[]};expect(validatePicture(p).nodes).toHaveLength(1);expect(()=>validatePicture({...p,edges:[{from:'a',to:'missing'}]})).toThrow('missing');expect(()=>validatePicture({...p,nodes:[{...p.nodes[0],x:2000}]})).toThrow('outside');expect(()=>validatePicture({script:'process.exit()'})).toThrow();});
it('embeds a PNG while preserving note content, persists it, and rejects stale revisions',async()=>{const dir=mkdtempSync(join(tmpdir(),'scoreler-picture-')),root=join(dir,'notes');mkdirSync(root);const folder=await authorizeStudyFolder(dir,root),path='Test.scoreler-drawing';await createNote(dir,folder.id,path,[{id:'keep',kind:'text',text:'Keep me',color:'#202124',points:[{x:20,y:30}]}]);const {revision}=await readNote(dir,folder.id,path),png=createCanvas(1280,800).toBuffer('image/png'),target={folderId:folder.id,path,revision};await insertPicture(dir,target,png);const {note}=await readNote(dir,folder.id,path);expect(note.elements[0].text).toBe('Keep me');expect(note.elements[1].kind).toBe('image');expect(note.elements[1].imageData).toContain(png.toString('base64'));await expect(insertPicture(dir,target,png)).rejects.toThrow('changed');await expect(insertPicture(dir,{...target,width:1700},png)).rejects.toThrow('fit');});
