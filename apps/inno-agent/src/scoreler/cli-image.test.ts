import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {readCliImage} from './cli-image.js';

it('loads a user-selected image with a Chinese path and rejects misleading extensions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'scoreler-cli-image-'));
 try{
  const image=join(dir,'题目.png');writeFileSync(image,Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]));
  expect((await readCliImage(image)).mimeType).toBe('image/png');
  const fake=join(dir,'fake.png');writeFileSync(fake,'not really an image');
  await expect(readCliImage(fake)).rejects.toThrow('Unsupported image format');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
