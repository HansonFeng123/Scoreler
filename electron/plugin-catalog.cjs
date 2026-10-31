const fs=require('node:fs'),p=require('node:path'),{randomUUID}=require('node:crypto');
const CATALOG_URL='https://raw.githubusercontent.com/HansonFeng123/scoreler-plugin-catalog/main/plugins.json';
const MAX_BYTES=1024*1024;
class PluginCatalog {
 constructor({home,bundledFile,fetcher=fetch,validate}){this.home=home;this.bundledFile=bundledFile;this.fetcher=fetcher;this.validate=validate;this.file=p.join(home,'catalog-cache.json');}
 read(){
  try{const cache=JSON.parse(fs.readFileSync(this.file,'utf8'));if(cache.source!==CATALOG_URL||typeof cache.checkedAt!=='string'||!Number.isFinite(Date.parse(cache.checkedAt)))throw Error();return {catalogue:this.validate(cache.catalogue),info:{source:'cached',url:CATALOG_URL,checkedAt:cache.checkedAt}};}catch{}
  return {catalogue:this.validate(JSON.parse(fs.readFileSync(this.bundledFile,'utf8'))),info:{source:'bundled',url:CATALOG_URL,checkedAt:null}};
 }
 async refresh(){
  let temporary;
  try{
   const response=await this.fetcher(CATALOG_URL,{redirect:'error',credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','Cache-Control':'no-cache'}});
   if(!response.ok)throw Error();
   if(Number(response.headers.get('content-length'))>MAX_BYTES){await response.body?.cancel();throw Error();}
   const parts=[];let size=0;
   for await(const chunk of response.body){size+=chunk.length;if(size>MAX_BYTES)throw Error();parts.push(chunk);}
   const catalogue=this.validate(JSON.parse(Buffer.concat(parts).toString('utf8')));
   const cache={source:CATALOG_URL,checkedAt:new Date().toISOString(),catalogue};
   temporary=p.join(this.home,'catalog-'+randomUUID()+'.tmp');
   fs.writeFileSync(temporary,JSON.stringify(cache),{mode:0o600});fs.renameSync(temporary,this.file);
   return this.read();
  }catch{throw Error('Could not refresh the plugin list. Check your connection or GitHub update proxy setting and retry. The saved list and installed plugins were kept.');}
  finally{if(temporary&&fs.existsSync(temporary))fs.unlinkSync(temporary);}
 }
}
module.exports={PluginCatalog,CATALOG_URL,MAX_BYTES};
