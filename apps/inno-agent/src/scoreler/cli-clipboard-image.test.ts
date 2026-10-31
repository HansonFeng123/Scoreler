import {it,expect} from 'vitest';
import sharp from 'sharp';
import {normalizeClipboardImage} from './cli-clipboard-image.js';
function bmp(bits=32,topDown=false,bitfields=false){
 const width=2,height=2,header=bitfields?124:40,stride=Math.ceil(width*bits/32)*4,offset=14+header,bytes=Buffer.alloc(offset+stride*height);bytes.write('BM');bytes.writeUInt32LE(bytes.length,2);bytes.writeUInt32LE(offset,10);bytes.writeUInt32LE(header,14);bytes.writeInt32LE(width,18);bytes.writeInt32LE(topDown?-height:height,22);bytes.writeUInt16LE(1,26);bytes.writeUInt16LE(bits,28);bytes.writeUInt32LE(bitfields?3:0,30);
 if(bitfields){bytes.writeUInt32LE(0xff0000,54);bytes.writeUInt32LE(0xff00,58);bytes.writeUInt32LE(0xff,62);bytes.writeUInt32LE(0xff000000,66);}
 const colors=[[255,0,0],[0,255,0],[0,0,255],[255,255,255]];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const pixel=offset+(topDown?y:height-1-y)*stride+x*bits/8,color=colors[y*width+x];bytes[pixel]=color[2];bytes[pixel+1]=color[1];bytes[pixel+2]=color[0];}
 return bytes;
}
it.each([[24,false,false],[32,false,false],[32,true,true]])('converts Windows %i-bit clipboard BMP to lossless PNG (top-down=%s, bitfields=%s)',async(bits,topDown,bitfields)=>{
 const output=normalizeClipboardImage(bmp(bits,topDown,bitfields));expect(output.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect([info.width,info.height]).toEqual([2,2]);expect([...data]).toEqual([255,0,0,255,0,255,0,255,0,0,255,255,255,255,255,255]);
});
it('preserves existing PNG bytes and rejects corrupt or oversized bitmap headers',async()=>{
 const png=await sharp({create:{width:4,height:4,channels:3,background:'red'}}).png().toBuffer();expect(normalizeClipboardImage(png)).toEqual(png);expect(()=>normalizeClipboardImage(bmp().subarray(0,60))).toThrow('bitmap');const bad=bmp();bad.writeInt32LE(1000000,18);expect(()=>normalizeClipboardImage(bad)).toThrow('bitmap');
});
