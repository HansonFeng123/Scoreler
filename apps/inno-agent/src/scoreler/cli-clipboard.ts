import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readCliImage,type CliImage} from './cli-image.js';
import {normalizeClipboardImage} from './cli-clipboard-image.js';

type Clipboard={getImage():Promise<Uint8Array|null|undefined>;getText():Promise<string|null|undefined>;getFilePaths?():Promise<string[]|null|undefined>};
type Pending={path:string;image:CliImage};
/** Only explicitly pasted images are attached. Deleting their path from the editor removes them from the request. */
export class ClipboardImages {
 private pending:Pending[]=[];
 private owned=new Set<string>();
 constructor(private directory:string){}
 referenced(text:string){return this.pending.filter(item=>text.includes(item.path));}
 redactPaths(text:string){for(const item of this.pending)text=text.split(item.path).join('[attached image]');return text;}
 clear(){this.pending=[];}
 async paste(clipboard:Clipboard|undefined,text:string,attached=0):Promise<{text:string;image:boolean}|undefined>{
  if(!clipboard)throw Error('Image clipboard is unavailable. Use /image "path" instead.');
  const bytes=await clipboard.getImage();
  let path:string|undefined,image:CliImage|undefined;
  const hasImage=!!bytes?.length;
  if(hasImage){
   const normalized=normalizeClipboardImage(bytes!);
   if(attached+this.referenced(text).length>=5)throw Error('At most five images per message.');
   await mkdir(this.directory,{recursive:true,mode:0o700});path=join(this.directory,'paste-'+randomUUID()+'.png');
   await writeFile(path,normalized,{mode:0o600,flag:'wx'});this.owned.add(path);
   try{image=await readCliImage(path);}catch(error){await unlink(path).catch(()=>{});this.owned.delete(path);throw error;}
  }else{
   const files=await clipboard.getFilePaths?.();
   const value=files?.[0]||(await clipboard.getText())?.trim();
   if(!value)return;
   const candidate=value.replace(/^(["'])(.*)\1$/,'$2');
   if(/\.(png|jpe?g|webp|gif)$/i.test(candidate)){
    if(attached+this.referenced(text).length>=5)throw Error('At most five images per message.');
    path=candidate;image=await readCliImage(path);
   }else return {text:value,image:false};
  }
  if(path&&image){this.pending=this.pending.filter(item=>item.path!==path);this.pending.push({path,image});return {text:`"${path}" `,image:true};}
 }
 async close(){this.clear();await Promise.all([...this.owned].map(path=>unlink(path).catch(()=>{})));this.owned.clear();}
}
