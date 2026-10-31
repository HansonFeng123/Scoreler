const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path'),crypto=require('node:crypto');
const {PluginStore}=require('../electron/plugin-store.cjs');
const {CATALOG_URL,MAX_BYTES}=require('../electron/plugin-catalog.cjs');
const {zipFiles}=require('./build-plugin-zip.cjs');
const meta=version=>({id:'catalog-test',owner:'Example',name:'Catalog test',description:'Synthetic offline tool',version,scoreler:{min:'1.3.0',max:'1.99.99'},apiVersion:1,permissions:[],entry:'index.html'});
const pkg=version=>zipFiles({'manifest.json':JSON.stringify(meta(version)),'index.html':'<h1>Synthetic tool</h1>'});
function catalog(version){const {version:v,entry,apiVersion,...rest}=meta(version),repository='https://github.com/Example/tool';return {schemaVersion:1,plugins:[{...rest,repository,subjects:['Math'],keywords:['test'],releases:[{version,tag:'v'+version,release:repository+'/releases/tag/v'+version,download:repository+'/releases/download/v'+version+'/tool.zip',sha256:crypto.createHash('sha256').update(pkg(version)).digest('hex')}]}]};}
function fixture(t,fetcher){const home=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-catalog-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const catalogFile=p.join(home,'plugins.json');fs.writeFileSync(catalogFile,JSON.stringify(catalog('1.0.0')));return new PluginStore({home,catalogFile,appVersion:'1.4.0',fetcher});}
test('remote refresh discovers updates without changing installed packages, survives restart, and supports reviewed updates',async t=>{
 const remote=catalog('1.1.0'),release=remote.plugins[0].releases[0],calls=[];
 const fetcher=async(url,init)=>{calls.push(url);if(url===CATALOG_URL){assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(new Headers(init.headers).has('authorization'),false);return Response.json(remote);}if(url.includes('/releases/tags/'))return Response.json({tag_name:release.tag,html_url:release.release,author:{login:'Example'},assets:[{browser_download_url:release.download,uploader:{login:'Example'}}]});if(url===release.download)return new Response(pkg('1.1.0'));throw Error('Unexpected request');};
 const store=fixture(t,fetcher);assert.equal(store.list().catalogueInfo.source,'bundled');assert.equal(calls.length,0);await store.install(pkg('1.0.0'));
 const refreshed=await store.refreshCatalog();assert.equal(refreshed.catalogue[0].releases[0].version,'1.1.0');assert.equal(refreshed.installed[0].manifest.version,'1.0.0');assert.equal(refreshed.installed[0].updateVersion,'1.1.0');assert.equal(calls.length,1);assert(refreshed.catalogueInfo.checkedAt);
 const restarted=new PluginStore({home:p.dirname(store.home),catalogFile:store.catalogFile,appVersion:'1.4.0',fetcher});assert.equal(restarted.list().catalogue[0].releases[0].version,'1.1.0');assert.equal(calls.length,1);
 const downloaded=await restarted.download('catalog-test','1.1.0');assert.equal(restarted.list().installed[0].manifest.version,'1.0.0');await restarted.install(downloaded.bytes,{origin:'catalogue',expected:downloaded.expected,update:true});assert.equal(restarted.list().installed[0].manifest.version,'1.1.0');
});
test('bad metadata, HTTP failures, network failures and oversized bodies preserve the valid cache and installed tool',async t=>{
 let response=()=>Response.json(catalog('1.1.0'));const store=fixture(t,async()=>response());await store.install(pkg('1.0.0'));await store.refreshCatalog();const previous=fs.readFileSync(store.catalog.file),installed=fs.readFileSync(p.join(store.home,'installed.json'));
 const unsafe=catalog('1.2.0');unsafe.plugins[0].releases[0].download='https://example.invalid/tool.zip';
 for(const fail of [()=>new Response('{broken'),()=>Response.json({schemaVersion:2,plugins:[]}),()=>Response.json(unsafe),()=>new Response('',{status:403}),()=>{throw Error('offline');},()=>new Response('x'.repeat(MAX_BYTES+1)),()=>new Response('x',{headers:{'Content-Length':String(MAX_BYTES+1)}})]){
  response=fail;await assert.rejects(store.refreshCatalog(),/saved list and installed plugins were kept/);assert.deepEqual(fs.readFileSync(store.catalog.file),previous);assert.deepEqual(fs.readFileSync(p.join(store.home,'installed.json')),installed);
 }
 assert.equal(store.list().installed[0].manifest.version,'1.0.0');
});
test('invalid local cache falls back to the bundled list without network access',t=>{
 const store=fixture(t,()=>{throw Error('Must not fetch on list');});for(const value of ['{broken',JSON.stringify({source:'https://untrusted.invalid/list',checkedAt:new Date().toISOString(),catalogue:catalog('1.1.0')})]){fs.writeFileSync(store.catalog.file,value);assert.equal(store.list().catalogueInfo.source,'bundled');assert.equal(store.list().catalogue[0].releases[0].version,'1.0.0');}
});
