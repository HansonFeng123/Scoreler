const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {installRuntimeBootstrap}=require('./runtime-bootstrap.cjs');
test('installs a safe fallback for argument-less launches and preserves unrelated runtime applications',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'scoreler-runtime-')),root=path.join(home,'updates','source-'+'a'.repeat(40));
 const resources=path.join(root,'node_modules/electron/dist/resources');
 try{
  fs.mkdirSync(resources,{recursive:true});fs.writeFileSync(path.join(root,'package.json'),'{"version":"1.1.1"}');
  // Branding is already complete in this fixture; the real executable is
  // exercised by the separate Windows launch regression check.
  fs.writeFileSync(path.join(resources,'../Scoreler.exe'),'fixture');
  installRuntimeBootstrap(root,home);const app=path.join(resources,'app');
  assert.equal(JSON.parse(fs.readFileSync(path.join(app,'package.json'))).name,'scoreler');
  const code=fs.readFileSync(path.join(app,'index.cjs'),'utf8');assert.match(code,/ready\.json/);assert.match(code,/Scoreler\.exe/);assert.match(code,/--scoreler-profile=/);
  installRuntimeBootstrap(root,home);
  fs.writeFileSync(path.join(app,'package.json'),'{"name":"another-app"}');
  assert.throws(()=>installRuntimeBootstrap(root,home),/another runtime application/);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
