const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {repairWindowsShortcut,repairPreviewShortcut}=require('../electron/windows-shortcut.cjs');
test('registers the proper Scoreler shortcut and backs up only its stale Electron entry',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'scoreler-shortcut-')),profile=path.join(base,'profile'),dir=path.join(base,'Microsoft/Windows/Start Menu/Programs'),file=path.join(dir,'Scoreler.lnk'),old=path.join(dir,'Electron.lnk'),installed=path.join(base,'Programs/Scoreler/Scoreler.exe');
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,'link');fs.writeFileSync(old,'old link');const links=new Map([[file,{target:installed}],[old,{target:path.join(profile,'updates/source-example/node_modules/electron/dist/electron.exe')}]]);const shell={readShortcutLink:f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return links.get(f);}},writeShortcutLink(f,mode,value){links.set(f,value);fs.writeFileSync(f,JSON.stringify(value));}};
  const executable=path.join(profile,'updates/source-example/node_modules/electron/dist/Scoreler.exe');
  assert.equal(repairWindowsShortcut({shell,appData:base,profile,executable,installed,root:'application',icon:'mascot.ico'}),true);
  assert.equal(shell.readShortcutLink(file).target,executable);assert.equal(shell.readShortcutLink(file).appUserModelId,'com.scoreler.desktop');assert.equal(shell.readShortcutLink(file).args,'');assert.equal(fs.existsSync(old),false);assert.equal(fs.readdirSync(path.join(profile,'shortcut-backups')).length,1);
  fs.writeFileSync(old,'unrelated');links.set(old,{target:path.join(base,'another-app/Electron.exe')});repairWindowsShortcut({shell,appData:base,profile,executable,installed,root:'application',icon:'mascot.ico'});assert.equal(fs.readFileSync(old,'utf8'),'unrelated');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});

test('preview has a matching separate shortcut and retires only its own Electron alias',t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'scoreler-preview-shortcut-'));t.after(()=>fs.rmSync(base,{recursive:true,force:true}));
 const profile=path.join(base,'profile'),root=path.join(base,'source'),dir=path.join(base,'Microsoft/Windows/Start Menu/Programs');fs.mkdirSync(dir,{recursive:true});
 const stable=path.join(dir,'Scoreler.lnk'),preview=path.join(dir,'Scoreler Preview.lnk'),legacy=path.join(dir,'Electron.lnk');fs.writeFileSync(stable,'keep installed shortcut');fs.writeFileSync(legacy,'legacy');
 const executable=path.join(root,'runtime/preview-runtime-example/Scoreler.exe'),links=new Map([[legacy,{target:path.join(root,'node_modules/electron/dist/electron.exe')}]]),shell={readShortcutLink:file=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return links.get(file);}},writeShortcutLink(file,mode,value){links.set(file,value);fs.writeFileSync(file,JSON.stringify(value));}};
 assert.equal(repairPreviewShortcut({shell,appData:base,profile,executable,root,icon:'theme.ico'}),true);
 assert.equal(fs.readFileSync(stable,'utf8'),'keep installed shortcut');assert.equal(shell.readShortcutLink(preview).appUserModelId,'com.scoreler.desktop.preview');assert.equal(shell.readShortcutLink(preview).target,executable);assert(shell.readShortcutLink(preview).args.includes(root));assert.equal(fs.existsSync(legacy),false);assert.equal(fs.readdirSync(path.join(profile,'shortcut-backups')).length,1);
 const before=fs.statSync(preview).mtimeMs;repairPreviewShortcut({shell,appData:base,profile,executable,root,icon:'theme.ico'});assert.equal(fs.statSync(preview).mtimeMs,before);assert.deepEqual(fs.readdirSync(path.join(profile,'shortcut-staging')),[]);
 fs.writeFileSync(legacy,'another app');links.set(legacy,{target:path.join(base,'other/Electron.exe')});repairPreviewShortcut({shell,appData:base,profile,executable,root,icon:'theme.ico'});assert.equal(fs.readFileSync(legacy,'utf8'),'another app');
});
