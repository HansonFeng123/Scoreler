// A private branded runtime keeps local previews out of Electron's shell identity.
const fs=require('node:fs'),p=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
function preparePreviewRuntime(root,profile){
 const source=p.join(root,'node_modules/electron/dist');
 if(process.platform!=='win32')return p.join(source,'electron');
 const appearance=require(p.join(root,'electron/appearance.cjs')).createAppearanceStore(p.join(profile,'study'));
 const icon=fs.existsSync(appearance.icon)?appearance.icon:p.join(root,'electron/scoreler.ico');
 const bootstrap=`const {app,dialog}=require('electron');
process.env.SCORELER_PREVIEW='1';process.env.SCORELER_CLI_TEST='1';process.env.SCORELER_TEST_NO_SHELL_REGISTRATION='1';
const root=${JSON.stringify(root)},profile=${JSON.stringify(profile)};
app.getAppPath=()=>root;
if(!process.argv.some(a=>a.startsWith('--scoreler-profile=')))process.argv.push('--scoreler-profile='+profile);
import(require('node:url').pathToFileURL(require('node:path').join(root,'electron/main.js')).href).catch(()=>{dialog.showErrorBox('Scoreler preview','The local preview could not start. Your study profile is preserved.');app.exit(1);});
`;
 const key=createHash('sha256').update(fs.readFileSync(p.join(source,'electron.exe'))).update(fs.readFileSync(icon)).update(bootstrap).digest('hex').slice(0,20);
 const target=p.join(root,'runtime','preview-runtime-'+key),executable=p.join(target,'Scoreler.exe');
 if(fs.existsSync(p.join(target,'ready.json'))&&fs.existsSync(executable))return executable;
 if(fs.existsSync(target))throw Error('Incomplete preview runtime found; existing files were preserved.');
 fs.cpSync(source,target,{recursive:true,dereference:true});
 fs.copyFileSync(p.join(source,'electron.exe'),executable);
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',p.join(root,'scripts/brand-runtime.ps1'),'-Executable',executable,'-Icon',icon],{windowsHide:true,stdio:'pipe',timeout:60000});
 const appDir=p.join(target,'resources/app');
 fs.mkdirSync(appDir,{recursive:true});
 fs.writeFileSync(p.join(appDir,'package.json'),JSON.stringify({name:'scoreler-preview',productName:'Scoreler',version:JSON.parse(fs.readFileSync(p.join(root,'package.json'),'utf8')).version,main:'index.cjs'}));
 fs.writeFileSync(p.join(appDir,'index.cjs'),bootstrap);
 fs.writeFileSync(p.join(target,'ready.json'),JSON.stringify({branded:true}));
 return executable;
}
module.exports={preparePreviewRuntime};
