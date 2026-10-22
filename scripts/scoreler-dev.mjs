import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const home=resolve(process.env.SCORELER_HOME||'runtime/scoreler');const config=join(home,'config');mkdirSync(config,{recursive:true});
const file=join(config,'config.json');
if(!existsSync(file))writeFileSync(file,JSON.stringify({defaultProvider:'scoreler',defaultModel:'configure-a-model',providers:{scoreler:{api:'openai-completions',baseUrl:'https://api.openai.com/v1',apiKey:'',models:[{id:'configure-a-model',name:'Configure a model',reasoning:false,input:['text'],contextWindow:32768,maxTokens:8192}]}},plugins:{computerUse:{enabled:false},codemode:{enabled:false}},subagents:{enabled:false},ui:{theme:'light',closeBehavior:'quit'}},null,2));
const child=spawn(process.execPath,['apps/inno-agent/dist/server.js','--home',home,'--port',process.env.SCORELER_PORT||'3000'],{stdio:'inherit',env:{...process.env,INNO_HOME:home,INNO_CONFIG_FILE:file,INNO_CONFIG_DIR:config,INNO_DATA_DIR:join(home,'data'),INNO_WORKSPACE_DIR:join(home,'generated'),PI_CODING_AGENT_DIR:join(home,'agent')}});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>process.exit(code??0));
