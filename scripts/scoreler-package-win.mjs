import {execFileSync} from 'node:child_process';
import { existsSync,readFileSync,mkdtempSync,mkdirSync,copyFileSync,cpSync } from 'node:fs';
import { resolve,join,dirname } from 'node:path';
import {tmpdir} from 'node:os';
import { spawn } from 'node:child_process';
const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
const optional={ELECTRON_BUILDER_NSIS_DIR:'runtime/build-tools/nsis',ELECTRON_BUILDER_NSIS_RESOURCES_DIR:'runtime/build-tools/nsis-resources',ELECTRON_BUILDER_RCEDIT_PATH:'runtime/build-cache/winCodeSign/winCodeSign-2.6.0'};
for(const [key,path] of Object.entries(optional))if(existsSync(path))env[key]=resolve(path);
if(existsSync('runtime/build-cache'))env.ELECTRON_BUILDER_CACHE=resolve('runtime/build-cache');
const project=process.cwd();
const args=[resolve('node_modules/electron-builder/cli.js'),'--win',process.argv.includes('--dir')?'dir':'nsis','--x64','--publish','never','--config.npmRebuild=false'];
args.push('--config.electronVersion='+JSON.parse(readFileSync('node_modules/electron/package.json','utf8')).version);
const edition='without-free-models';
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
args.push('--config.extraMetadata.scorelerSourceCommit='+commit);
if(edition){
 
 args.push('--config.extraMetadata.scorelerEdition='+edition,'--config.extraMetadata.version='+version,
  '--config.nsis.deleteAppDataOnUninstall=false',
  '--config.artifactName=Scoreler-'+version+'-Windows-'+'Bring-Your-Own-Model'+'-Setup.${ext}');
}
if(process.env.SCORELER_BUILD_OUTPUT)args.push('--config.directories.output='+resolve(process.env.SCORELER_BUILD_OUTPUT));
if(existsSync('node_modules/electron/dist/electron.exe'))args.push('--config.electronDist='+resolve('node_modules/electron/dist'));
// Linked development dependencies can make electron-builder silently omit
// transitive packages. Package a clean production installation instead.
const stage=mkdtempSync(join(tmpdir(),'scoreler-package-'));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const file of files){const target=join(stage,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(project,file),target);}
for(const folder of ['apps/inno-agent/dist','apps/inno-agent/web/dist','apps/inno-agent/video-dist'])cpSync(join(project,folder),join(stage,folder),{recursive:true});
execFileSync('cmd.exe',['/d','/s','/c','npm.cmd ci --omit=dev --ignore-scripts --prefer-offline --no-audit --no-fund'],{cwd:stage,env,stdio:'inherit',windowsHide:true});
const child=spawn(process.execPath,args,{cwd:stage,stdio:'inherit',env,windowsHide:true});child.on('exit',code=>process.exit(code??1));
