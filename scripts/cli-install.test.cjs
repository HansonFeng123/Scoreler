const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path');
const {createCliInstall}=require('../electron/cli-install.cjs');
const {resolveCliRoot}=require('./scoreler-cli-launch.cjs');
test('optional command install and removal change only their own files and path entry',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-install-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const calls=[],root=p.resolve(__dirname,'..'),installer=createCliInstall({profile,root,executable:'C:\\Scoreler\\Scoreler.exe',version:'1.4.0',platform:'win32',updatePath:(bin,add)=>calls.push({bin,add})});
 assert.equal(installer.state().installed,false);fs.writeFileSync(p.join(profile,'history-marker'),'keep');
 assert.equal(installer.install().installed,true);const cmd=fs.readFileSync(p.join(profile,'cli/bin/scoreler.cmd'),'utf8');assert(cmd.includes('ELECTRON_RUN_AS_NODE=1'));assert(cmd.includes('launch.cjs'));assert(!cmd.includes('apiKey'));
 assert.equal(JSON.parse(fs.readFileSync(p.join(profile,'cli/bin/launcher.json'),'utf8')).version,'1.4.0');
 assert.equal(installer.uninstall().installed,false);assert.equal(fs.readFileSync(p.join(profile,'history-marker'),'utf8'),'keep');assert.deepEqual(calls.map(c=>c.add),[true,false]);
});
test('launcher follows only a ready update containing the CLI and rejects path escapes',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-ready-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));const root=p.join(profile,'installed'),commit='a'.repeat(40),directory='source-'+commit,candidate=p.join(profile,'updates',directory),ready=p.join(profile,'updates/ready.json');fs.mkdirSync(p.join(candidate,'apps/inno-agent/dist/scoreler'),{recursive:true});
 fs.writeFileSync(ready,JSON.stringify({commit,directory}));assert.equal(resolveCliRoot({root,profile}),root);
 fs.writeFileSync(p.join(candidate,'apps/inno-agent/dist/scoreler/terminal.js'),'');assert.equal(resolveCliRoot({root,profile}),candidate);assert.equal(resolveCliRoot({root,profile,preview:true}),root);
 fs.writeFileSync(ready,JSON.stringify({commit,directory:'../outside'}));assert.equal(resolveCliRoot({root,profile}),root);
});
test('failed user PATH registration rolls back a new optional install',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-path-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));const installer=createCliInstall({profile,root:p.resolve(__dirname,'..'),executable:'C:\\Scoreler.exe',version:'1.4.0',platform:'win32',updatePath:()=>{throw Error('Path denied');}});assert.throws(()=>installer.install(),/Path denied/);assert.equal(installer.state().installed,false);assert(!fs.existsSync(p.join(profile,'cli/bin/scoreler.cmd')));
});
