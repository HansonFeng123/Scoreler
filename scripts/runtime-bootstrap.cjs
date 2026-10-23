const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');

// Windows may retain a shortcut to the runtime with no app argument. Give that
// runtime an application so it cannot fall back to Electron's welcome screen.
const bootstrap=`const {app,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path');
try {
 const profile=process.argv.find(a=>a.startsWith('--scoreler-profile='))?.slice('--scoreler-profile='.length)||path.join(app.getPath('appData'),'scoreler-desktop');
 const base=path.join(profile,'updates'),ready=JSON.parse(fs.readFileSync(path.join(base,'ready.json'),'utf8'));
 if(!/^[a-f0-9]{40}$/.test(ready.commit)||ready.directory!=='source-'+ready.commit)throw Error('Invalid Scoreler update selection.');
 const root=path.join(base,ready.directory);
 if(!fs.existsSync(path.join(root,'electron/main.js')))throw Error('Scoreler application files are missing.');
 const branded=path.join(root,'node_modules/electron/dist/Scoreler.exe');
 if(process.execPath.toLowerCase()!==branded.toLowerCase()&&fs.existsSync(branded)){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(branded,['--scoreler-profile='+profile],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:true});
  child.once('spawn',()=>{child.unref();app.quit();});child.once('error',()=>{dialog.showErrorBox('Scoreler','Could not open the Scoreler runtime.');app.quit();});
 }else{
 app.setName('Scoreler');app.setAppUserModelId('com.scoreler.desktop');app.getAppPath=()=>root;
 if(!process.argv.some(a=>a.startsWith('--scoreler-profile=')))process.argv.push('--scoreler-profile='+profile);
 import(require('node:url').pathToFileURL(path.join(root,'electron/main.js')).href).catch(()=>{dialog.showErrorBox('Scoreler','Scoreler could not start. Your study profile is unchanged.');app.quit();});
 }
} catch(error) {dialog.showErrorBox('Scoreler',error.message);app.quit();}
`;

function installRuntimeBootstrap(root,home){
 const electron=path.join(root,'node_modules/electron'),base=fs.realpathSync(path.join(home,'updates'));
 let resources=fs.realpathSync(path.join(electron,'dist/resources'));
 const expected=path.join(electron,'dist/resources');
 if(resources.toLowerCase()!==expected.toLowerCase()){
  // Dependency reuse may point outside this profile. Copy before changing any
  // resources, keeping development and other editions untouched.
  if(!fs.lstatSync(electron).isSymbolicLink())throw Error('Electron runtime is outside the update profile');
  const local=path.join(root,'node_modules/.scoreler-electron-copy');
  if(fs.existsSync(local))throw Error('Incomplete private runtime copy exists');
  fs.cpSync(fs.realpathSync(electron),local,{recursive:true});
  // A copied older runtime may already contain obsolete branding. Rebrand the
  // independent copy, never the executable another app instance is using.
  const oldBrand=path.join(local,'dist/Scoreler.exe');if(fs.existsSync(oldBrand))fs.unlinkSync(oldBrand);
  fs.unlinkSync(electron);fs.renameSync(local,electron);
  resources=path.join(electron,'dist/resources');
 }
 if(!resources.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('Electron runtime is outside the update profile');
 const dir=path.join(resources,'app');fs.mkdirSync(dir,{recursive:true});
 if(fs.existsSync(path.join(dir,'package.json'))&&JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).name!=='scoreler')throw Error('Refusing to replace another runtime application');
 fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'scoreler',productName:'Scoreler',version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,main:'index.cjs'}));
 fs.writeFileSync(path.join(dir,'index.cjs'),bootstrap);
 if(process.platform==='win32'){
  const dist=path.dirname(resources),branded=path.join(dist,'Scoreler.exe');
  if(!fs.existsSync(branded)){
   const temporary=path.join(dist,'Scoreler-branding.exe');fs.copyFileSync(path.join(dist,'electron.exe'),temporary);
   try{execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'scripts/brand-runtime.ps1'),'-Executable',temporary,'-Icon',path.join(root,'electron/scoreler.ico')],{windowsHide:true,stdio:'pipe',timeout:60000});fs.renameSync(temporary,branded);}catch(error){try{fs.unlinkSync(temporary);}catch{}throw Error('Could not prepare the Scoreler runtime icon');}
  }
 }
}
module.exports={installRuntimeBootstrap};
