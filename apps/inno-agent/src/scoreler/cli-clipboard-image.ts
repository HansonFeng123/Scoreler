import {deflateSync} from 'node:zlib';
import {imageFromBytes} from './cli-image.js';
const crcTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let i=0;i<8;i++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
function chunk(name:string,data:Buffer){const type=Buffer.from(name),body=Buffer.concat([type,data]),result=Buffer.alloc(body.length+8);result.writeUInt32BE(data.length,0);body.copy(result,4);let crc=0xffffffff;for(const byte of body)crc=crcTable[(crc^byte)&255]^(crc>>>8);result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;}
/** Windows CF_DIB/CF_DIBV5 clipboard data is returned by Pi as a BMP, regardless of the source file's extension. */
export function normalizeClipboardImage(value:Uint8Array):Buffer {
 const bytes=Buffer.from(value);
 if(bytes.length>70*1024*1024)throw Error('Clipboard image is too large. Save a smaller screenshot and use /image.');
 if(bytes.toString('ascii',0,2)!=='BM'){imageFromBytes(bytes);return bytes;}
 const invalid=()=>new Error('This clipboard bitmap could not be converted. Save it as PNG and use /image "path".');
 if(bytes.length<54)throw invalid();
 const offset=bytes.readUInt32LE(10),header=bytes.readUInt32LE(14),width=bytes.readInt32LE(18),signedHeight=bytes.readInt32LE(22),height=Math.abs(signedHeight),bits=bytes.readUInt16LE(28),compression=bytes.readUInt32LE(30);
 const masksEnd=header===40&&compression===3?66:14+header;
 if(header<40||14+header>bytes.length||offset<masksEnd||offset>bytes.length||bytes.readUInt16LE(26)!==1||width<=0||height<=0||width*height>16*1024*1024||![24,32].includes(bits)||![0,3].includes(compression))throw invalid();
 const stride=Math.ceil(width*bits/32)*4;
 if(offset+height*stride>bytes.length)throw invalid();
 let masks=[0xff0000,0xff00,0xff,0];
 if(compression===3){if(bytes.length<66)throw invalid();masks=[bytes.readUInt32LE(54),bytes.readUInt32LE(58),bytes.readUInt32LE(62),header>=56?bytes.readUInt32LE(66):0];}
 else if(header>=108&&bits===32&&bytes.readUInt32LE(66))masks=[bytes.readUInt32LE(54),bytes.readUInt32LE(58),bytes.readUInt32LE(62),bytes.readUInt32LE(66)];
 const channels=masks.map((mask,index)=>{if(!mask){if(index<3)throw invalid();return null;}let shift=0;while(((mask>>>shift)&1)===0&&shift<32)shift++;const max=mask>>>shift;if((max&(max+1))!==0)throw invalid();return {mask,shift,max};});
 const scanlines=Buffer.alloc((width*4+1)*height);let nonzeroAlpha=false;
 for(let y=0;y<height;y++){const row=offset+(signedHeight<0?y:height-1-y)*stride,target=y*(width*4+1);for(let x=0;x<width;x++){const source=row+x*(bits/8),pixel=bits===32?bytes.readUInt32LE(source):bytes.readUIntLE(source,3);for(let c=0;c<4;c++){const channel=channels[c];const value=channel?Math.round(((pixel&channel.mask)>>>channel.shift)*255/channel.max):255;scanlines[target+1+x*4+c]=value;if(c===3&&value)nonzeroAlpha=true;}}}
 // Some clipboard owners fill the unused alpha channel with zeros.
 if(!nonzeroAlpha)for(let y=0;y<height;y++)for(let x=0;x<width;x++)scanlines[y*(width*4+1)+1+x*4+3]=255;
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]);
 imageFromBytes(png);return png;
}
