const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path');
const {createCliInstall}=require('../electron/cli-install.cjs');
const {resolveCliRoot}=require('./scoreler-cli-launch.cjs');

test('Windows Apps alias works with an older PATH and preserves unrelated aliases',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-alias-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));const aliasDirectory=p.join(profile,'WindowsApps'),options={profile,root:p.resolve(__dirname,'..'),executable:'C:\\Scoreler.exe',version:'1.4.0',platform:'win32',aliasDirectory,updatePath:()=>{}};
 const installer=createCliInstall(options);installer.install();const alias=p.join(aliasDirectory,'scoreler.cmd');assert.match(fs.readFileSync(alias,'utf8'),/Scoreler optional CLI alias/);assert(fs.readFileSync(alias,'utf8').includes(p.join(profile,'cli/bin/scoreler.cmd')));installer.uninstall();assert(!fs.existsSync(alias));
 fs.writeFileSync(alias,'another application');assert.throws(()=>installer.install(),/already exists/);assert.equal(fs.readFileSync(alias,'utf8'),'another application');assert.equal(installer.state().installed,false);
});
test('optional command install and removal change only their own files and path entry',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-install-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const calls=[],root=p.resolve(__dirname,'..'),installer=createCliInstall({profile,root,executable:'C:\\Scoreler\\Scoreler.exe',version:'1.4.0',platform:'win32',updatePath:(bin,add)=>calls.push({bin,add})});
 assert.equal(installer.state().installed,false);fs.writeFileSync(p.join(profile,'history-marker'),'keep');
 assert.equal(installer.install().installed,true);const cmd=fs.readFileSync(p.join(profile,'cli/bin/scoreler.cmd'),'utf8');assert(!cmd.includes('ELECTRON_RUN_AS_NODE=1'));assert.match(cmd,/"[^"]*node(?:\.exe)?" /i);assert(!cmd.includes('\"C:\\Scoreler\\Scoreler.exe\"')); assert(cmd.includes('launch.cjs'));assert(!cmd.includes('apiKey'));
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

test('migrates installed Roaming commands to stable terminal storage without moving study data',t=>{
 const profile=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-migration-'));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const options={profile,root:p.resolve(__dirname,'..'),executable:'C:\\Scoreler.exe',version:'1.4.1',platform:'win32',aliasDirectory:p.join(profile,'WindowsApps'),updatePath:()=>{}};
 createCliInstall(options).install();fs.writeFileSync(p.join(profile,'study-marker'),'keep');
 const terminalProfile=p.join(profile,'stable-local'),installer=createCliInstall({...options,terminalProfile});installer.sync();
 const config=JSON.parse(fs.readFileSync(p.join(terminalProfile,'cli/bin/launcher.json'),'utf8'));
 assert.equal(config.profile,terminalProfile);assert.equal(config.desktopProfile,profile);assert(fs.readFileSync(p.join(options.aliasDirectory,'scoreler.cmd'),'utf8').includes(p.join(terminalProfile,'cli/bin/scoreler.cmd')));
 assert.equal(fs.readFileSync(p.join(profile,'study-marker'),'utf8'),'keep');installer.uninstall();assert(!installer.state().installed);assert(!fs.existsSync(p.join(options.aliasDirectory,'scoreler.cmd')));
});

test('published launchers use native physical paths rather than redirected logical paths',t=>{
 const home=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-cli-physical-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const physical=p.join(home,'physical'),logical=p.join(home,'logical');fs.mkdirSync(physical);fs.symlinkSync(physical,logical,process.platform==='win32'?'junction':'dir');
 const installer=createCliInstall({profile:p.join(home,'profile'),terminalProfile:logical,root:p.resolve(__dirname,'..'),executable:'C:\\Scoreler.exe',version:'1.4.1',platform:'win32',aliasDirectory:p.join(home,'WindowsApps'),nodeExecutable:process.execPath,updatePath:()=>{}});installer.install();
 const alias=fs.readFileSync(p.join(home,'WindowsApps/scoreler.cmd'),'utf8'),cmd=fs.readFileSync(p.join(physical,'cli/bin/scoreler.cmd'),'utf8'),config=JSON.parse(fs.readFileSync(p.join(physical,'cli/bin/launcher.json')));
 assert(alias.includes(p.join(physical,'cli/bin/scoreler.cmd')));assert(cmd.includes(p.join(physical,'cli/bin/launch.cjs')));assert.equal(config.profile,fs.realpathSync.native(physical));assert(!alias.includes(logical));
});
