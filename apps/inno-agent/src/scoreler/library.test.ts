import { mkdtempSync, mkdirSync, writeFileSync, unlinkSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importStudyDocument, waitForIndexing, authorizeStudyFolder, scanStudyFolders, type LibraryDocument } from './library.js';
import { studentStore } from './store.js';
function setup(){return mkdtempSync(join(tmpdir(),'scoreler-library-'));}
function simplePdf(text:string){
 const stream=`BT /F1 12 Tf 50 740 Td (${text}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return Buffer.from(pdf);
}
describe('authorized study library',()=>{
 it('extracts DOCX without LibreOffice and cites text without inventing page numbers',async()=>{
  const dir=setup(),zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Superposition is the addition of displacements. 波的叠加。</w:t></w:r></w:p></w:body></w:document>');
  const doc=await importStudyDocument(dir,{name:'waves.docx',source:'waves.docx',data:await zip.generateAsync({type:'nodebuffer'})});await waitForIndexing(dir);
  expect(studentStore(dir).get<LibraryDocument>('documents',doc.id)?.status).toBe('ready');expect(studentStore(dir).search('叠加')).toMatchObject([{source:'waves.docx',page:0}]);
 });
 it('extracts an actual PDF with physical page citations',async()=>{const dir=setup();const d=await importStudyDocument(dir,{name:'physics.pdf',source:'physics.pdf',data:simplePdf('Waves interfere through superposition.')});await waitForIndexing(dir);expect(studentStore(dir).get<LibraryDocument>('documents',d.id)).toMatchObject({status:'ready',pages:1});expect(studentStore(dir).search('interfere')).toMatchObject([{page:1}]);},30000);
 it('detects folder additions, modifications and deletions without changing originals',async()=>{
  const dir=setup(),root=join(dir,'originals');mkdirSync(root);const path=join(root,'notes.md');writeFileSync(path,'Original mechanics notes');await authorizeStudyFolder(join(dir,'data'),root);await scanStudyFolders(join(dir,'data'));const store=studentStore(join(dir,'data'));expect(store.search('mechanics')).toHaveLength(1);
  writeFileSync(path,'Changed thermodynamics notes');await scanStudyFolders(join(dir,'data'));expect(store.search('mechanics')).toHaveLength(0);expect(store.search('thermodynamics')).toHaveLength(1);
  unlinkSync(path);await scanStudyFolders(join(dir,'data'));expect(store.search('thermodynamics')).toHaveLength(0);expect(store.list('documents')).toHaveLength(0);
 });
 it('keeps prior indexed documents when a folder is temporarily inaccessible',async()=>{const dir=setup(),root=join(dir,'originals'),data=join(dir,'data');mkdirSync(root);writeFileSync(join(root,'energy.md'),'Conservation of energy');await authorizeStudyFolder(data,root);await scanStudyFolders(data);renameSync(root,root+'-offline');await scanStudyFolders(data);expect(studentStore(data).search('energy')).toHaveLength(1);expect(studentStore(data).list<{error:string}>('folders')[0].error).toBeTruthy();renameSync(root+'-offline',root);});
});
