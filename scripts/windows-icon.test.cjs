const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path');
const {windowsIcon,atomicWrite}=require('../electron/windows-icon.cjs');
const nativeImage={createFromBuffer:()=>({isEmpty:()=>false,resize:({width})=>({toBitmap:()=>{const pixels=Buffer.alloc(width*width*4,255);pixels[3]=0;return pixels;}})})};
test('Windows ICO contains native shell sizes, correct alpha masks and bounded image frames',()=>{
 const ico=windowsIcon(Buffer.from('synthetic pixels'),nativeImage);assert.equal(ico.readUInt16LE(2),1);assert.equal(ico.readUInt16LE(4),7);
 const sizes=[];for(let i=0;i<7;i++){const at=6+i*16,size=ico[at]||256,offset=ico.readUInt32LE(at+12),length=ico.readUInt32LE(at+8);sizes.push(size);assert(offset+length<=ico.length);assert.equal(ico.readUInt32LE(offset),40);assert.equal(ico.readInt32LE(offset+8),size*2);assert.equal(ico.readUInt16LE(offset+14),32);const stride=Math.ceil(size/32)*4;assert.equal(ico[offset+40+size*size*4+(size-1)*stride],128);}
 assert.deepEqual(sizes,[16,24,32,48,64,128,256]);
});
test('unchanged appearance assets are never truncated or rewritten',t=>{
 const dir=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-icon-write-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=p.join(dir,'icon.ico'),data=Buffer.from('verified complete icon');
 assert.equal(atomicWrite(file,data),true);fs.utimesSync(file,new Date(1000),new Date(1000));const before=fs.statSync(file).mtimeMs;
 assert.equal(atomicWrite(file,data),false);assert.equal(fs.statSync(file).mtimeMs,before);assert(fs.readFileSync(file).equals(data));
 assert.equal(atomicWrite(file,Buffer.from('replacement')),true);assert.deepEqual(fs.readdirSync(dir),['icon.ico']);
});
