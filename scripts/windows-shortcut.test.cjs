const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {repairWindowsShortcut}=require('../electron/windows-shortcut.cjs');
test('registers the proper Scoreler shortcut and backs up only its stale Electron entry',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'scoreler-shortcut-')),profile=path.join(base,'profile'),dir=path.join(base,'Microsoft/Windows/Start Menu/Programs'),file=path.join(dir,'Scoreler.lnk'),old=path.join(dir,'Electron.lnk'),installed=path.join(base,'Programs/Scoreler/Scoreler.exe');
 try{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,'link');fs.writeFileSync(old,'old link');const links=new Map([[file,{target:installed}],[old,{target:path.join(profile,'updates/source-example/node_modules/electron/dist/electron.exe')}]]);const shell={readShortcutLink:f=>links.get(f),writeShortcutLink(f,mode,value){links.set(f,value);}};
  const executable=path.join(profile,'updates/source-example/node_modules/electron/dist/Scoreler.exe');
  assert.equal(repairWindowsShortcut({shell,appData:base,profile,executable,installed,root:'application',icon:'mascot.ico'}),true);
  assert.equal(links.get(file).target,executable);assert.equal(links.get(file).appUserModelId,'com.scoreler.desktop');assert.equal(links.get(file).args,'');assert.equal(fs.existsSync(old),false);assert.equal(fs.readdirSync(path.join(profile,'shortcut-backups')).length,1);
  fs.writeFileSync(old,'unrelated');links.set(old,{target:path.join(base,'another-app/Electron.exe')});repairWindowsShortcut({shell,appData:base,profile,executable,installed,root:'application',icon:'mascot.ico'});assert.equal(fs.readFileSync(old,'utf8'),'unrelated');
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
