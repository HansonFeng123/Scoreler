const fs=require('node:fs'),p=require('node:path'),{randomUUID}=require('node:crypto');
function atomicWrite(file,data){
 if(fs.existsSync(file)&&fs.readFileSync(file).equals(data))return false;
 fs.mkdirSync(p.dirname(file),{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temporary,data,{flag:'wx'});fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return true;
}
// Include native Windows bitmap frames at shell/DPI sizes. All writes happen
// before publishing the content-addressed filename to a shortcut or window.
function windowsIcon(png,nativeImage){
 const image=nativeImage.createFromBuffer(png);if(image.isEmpty())throw Error('Invalid mascot PNG');
 const sizes=[16,24,32,48,64,128,256],frames=[];
 for(const size of sizes){
  const bitmap=image.resize({width:size,height:size,quality:'best'}).toBitmap();
  if(bitmap.length!==size*size*4)throw Error('Invalid mascot bitmap');
  const stride=Math.ceil(size/32)*4,frame=Buffer.alloc(40+bitmap.length+stride*size);
  frame.writeUInt32LE(40);frame.writeInt32LE(size,4);frame.writeInt32LE(size*2,8);frame.writeUInt16LE(1,12);frame.writeUInt16LE(32,14);frame.writeUInt32LE(bitmap.length,20);
  for(let y=0;y<size;y++){
   bitmap.copy(frame,40+(size-1-y)*size*4,y*size*4,(y+1)*size*4);
   for(let x=0;x<size;x++)if(bitmap[(y*size+x)*4+3]<128)frame[40+bitmap.length+(size-1-y)*stride+(x>>3)]|=0x80>>(x&7);
  }
  frames.push(frame);
 }
 const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,i)=>{const at=6+i*16;header[at]=header[at+1]=size===256?0:size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(frames[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=frames[i].length;});
 return Buffer.concat([header,...frames]);
}
module.exports={atomicWrite,windowsIcon};
