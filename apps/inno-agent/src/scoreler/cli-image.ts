import {open} from 'node:fs/promises';

export type CliImage={data:string;mimeType:'image/png'|'image/jpeg'|'image/webp'|'image/gif'};
const maxBytes=10*1024*1024;

/** Read only a path explicitly supplied by the user and validate the actual image signature. */
export async function readCliImage(path:string):Promise<CliImage> {
 if(!path.trim())throw Error('Provide a PNG, JPEG, WebP or GIF image path.');
 const file=await open(path,'r');
 try{
  const stat=await file.stat();
  if(!stat.isFile()||stat.size<12||stat.size>maxBytes)throw Error('Image must be a file no larger than 10 MB.');
  const data=await file.readFile();
  if(data.length!==stat.size||data.length>maxBytes)throw Error('Image changed while it was read.');
  return imageFromBytes(data);
 }finally{await file.close();}
}

export function imageFromBytes(data:Buffer):CliImage {
 if(data.length>maxBytes)throw Error('Image must be no larger than 10 MB.');
 const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=data[0]===0xff&&data[1]===0xd8&&data[2]===0xff;
  const webp=data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  const gif=['GIF87a','GIF89a'].includes(data.toString('ascii',0,6));
  const mimeType=png?'image/png':jpeg?'image/jpeg':webp?'image/webp':gif?'image/gif':null;
  if(!mimeType)throw Error('Unsupported image format. Use PNG, JPEG, WebP or GIF.');
  return {data:data.toString('base64'),mimeType};
}
