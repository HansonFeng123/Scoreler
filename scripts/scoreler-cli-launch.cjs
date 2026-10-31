// This small launcher is copied locally when the user installs the optional command.
const fs=require('node:fs'),p=require('node:path'),{pathToFileURL}=require('node:url'),{spawn}=require('node:child_process');
function resolveCliRoot(config){
 let root=config.root;
 if(config.preview)return root;
 try{const ready=JSON.parse(fs.readFileSync(p.join(config.profile,'updates','ready.json'),'utf8'));if(/^[a-f0-9]{40}$/.test(ready.commit)&&ready.directory==='source-'+ready.commit){const candidate=p.join(config.profile,'updates',ready.directory);if(fs.existsSync(p.join(candidate,'apps/inno-agent/dist/scoreler/terminal.js')))root=candidate;}}catch{}
 return root;
}
async function launch(config,args){
 const root=resolveCliRoot(config),entry=p.join(root,'apps/inno-agent/dist/scoreler/terminal.js');
 if(!fs.existsSync(entry))throw Error('This Scoreler version does not contain the CLI. Open Scoreler and update or reinstall the optional CLI.');
 const startApp=()=>{const env={...process.env};if(config.preview)Object.assign(env,{SCORELER_PREVIEW:'1',SCORELER_CLI_TEST:'1',SCORELER_TEST_NO_SHELL_REGISTRATION:'1'});delete env.ELECTRON_RUN_AS_NODE;const child=spawn(config.executable,[root,'--scoreler-profile='+config.profile,'--scoreler-cli-start'],{cwd:p.dirname(config.executable),env,detached:true,stdio:'ignore',windowsHide:true});child.once('error',()=>{});child.unref();};
 const {startTerminal}=await import(pathToFileURL(entry).href);await startTerminal({profile:config.profile,args,startApp});
}
if(require.main===module){try{const config=JSON.parse(fs.readFileSync(p.join(__dirname,'launcher.json'),'utf8'));launch(config,process.argv.slice(2)).catch(error=>{process.stderr.write('Scoreler: '+error.message+'\n');process.exitCode=1;});}catch{process.stderr.write('Scoreler CLI installation is incomplete. Reinstall it from Scoreler Settings.\n');process.exitCode=1;}}
module.exports={launch,resolveCliRoot};
