import {execFileSync} from 'node:child_process';
import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
const optional={ELECTRON_BUILDER_NSIS_DIR:'runtime/build-tools/nsis',ELECTRON_BUILDER_NSIS_RESOURCES_DIR:'runtime/build-tools/nsis-resources',ELECTRON_BUILDER_RCEDIT_PATH:'runtime/build-cache/winCodeSign/winCodeSign-2.6.0'};
for(const [key,path] of Object.entries(optional))if(existsSync(path))env[key]=resolve(path);
if(existsSync('runtime/build-cache'))env.ELECTRON_BUILDER_CACHE=resolve('runtime/build-cache');
const args=['node_modules/electron-builder/cli.js','--win',process.argv.includes('--dir')?'dir':'nsis','--x64','--publish','never','--config.npmRebuild=false'];
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
if(existsSync('node_modules/electron/dist/electron.exe'))args.push('--config.electronDist=node_modules/electron/dist');
const child=spawn(process.execPath,args,{stdio:'inherit',env,windowsHide:true});child.on('exit',code=>process.exit(code??1));
