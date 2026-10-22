const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
function run(file,args,cwd){try{return execFileSync(file,args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:600000,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}}).trim();}catch{throw Error('Update command failed. Check Git authentication, network access, and the local build logs; no credentials are printed.');}}
function updater(root,{build}={}){
 root=fs.realpathSync(root);const config=JSON.parse(fs.readFileSync(path.join(root,'source-update.json'),'utf8'));
 if(config.edition!=='source'||!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(config.repository)||!/^[-A-Za-z0-9_./]+$/.test(config.branch)||config.branch.startsWith('-')||config.branch.includes('..'))throw Error('Invalid source update channel');
 const git=(...args)=>run('git',args,root);
 function validate(){
  if(fs.realpathSync(git('rev-parse','--show-toplevel'))!==root)throw Error('Run the updater from its own Git checkout');
  if(git('config','--get','remote.origin.url')!==config.repository)throw Error('Origin does not match this edition’s update channel');
  if(git('branch','--show-current')!==config.branch)throw Error('Switch to the configured source branch before updating');
  if(git('status','--porcelain','--untracked-files=all'))throw Error('Commit, stash, or remove local changes before updating');
 }
 function check(){validate();const current=git('rev-parse','HEAD');git('fetch','--no-tags','origin',config.branch);const target=git('rev-parse','FETCH_HEAD');const [ahead,behind]=git('rev-list','--left-right','--count','HEAD...FETCH_HEAD').split(/\s+/).map(Number);if(ahead)throw Error('Local commits differ from the release branch; automatic merge is refused');return {repository:config.repository,branch:config.branch,current,target,available:behind>0,commitsBehind:behind};}
 function apply({confirm=false,expected}={}){
  if(!confirm||!/^[a-f0-9]{40}$/.test(expected||''))throw Error('Review a check result, then pass --confirm --expected <commit>');
  const state=check();if(state.target!==expected)throw Error('The remote changed after review. Check and review the new commit first');if(!state.available)return {...state,updated:false};
  validate();git('merge','--ff-only',state.target);
  try{if(build)build(root);else{const cli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');if(!fs.existsSync(cli))throw Error('Run updates using npm run update:apply');run(process.execPath,[cli,'ci'],root);run(process.execPath,[cli,'run','build'],root);}}
  catch{git('reset','--hard',state.current);throw Error('Build failed; source was restored to the previous commit. Re-run npm ci and npm run build before opening Scoreler. User data was not changed.');}
  return {...state,updated:true};
 }
 return {check,apply};
}
module.exports={updater};
if(require.main===module){try{const root=path.resolve(__dirname,'..'),action=process.argv[2],client=updater(root);const result=action==='check'?client.check():action==='apply'?client.apply({confirm:process.argv.includes('--confirm'),expected:process.argv[process.argv.indexOf('--expected')+1]}):(()=>{throw Error('Use check or apply')})();console.log(JSON.stringify(result,null,2));}catch(e){console.error(e.message);process.exitCode=1;}}
