import {open} from 'node:fs/promises';
import {basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {Container,Editor,Markdown,ProcessTerminal,TuiAltScreen,getNativeClipboard,matchesKey,visibleWidth,truncateToWidth,wrapTextWithAnsi,type MarkdownTheme,type TuiMouseEvent} from '@earendil-works/pi-tui';
import {CliConnection} from './cli-connection.js';
import {calendarLines,parseCliCommand,plainTerminalText} from './cli-layout.js';
import {readCliImage,imageFromBytes,type CliImage} from './cli-image.js';
import {ClipboardImages} from './cli-clipboard.js';
import {CliPicker,type Choice} from './cli-picker.js';
import {normalizeClipboardImage} from './cli-clipboard-image.js';
import {join} from 'node:path';
import type {StudyEvent} from './store.js';
import {scorelerMark,smallScorelerMark} from './cli-mascot.js';
export {scorelerMark} from './cli-mascot.js';

const identity=(text:string)=>text;
const theme:MarkdownTheme={heading:identity,link:identity,linkUrl:identity,code:identity,codeBlock:identity,codeBlockBorder:identity,quote:identity,quoteBorder:identity,hr:identity,listBullet:identity,bold:text=>'\x1b[1m'+text+'\x1b[22m',italic:identity,strikethrough:identity,underline:identity};
const help='/new · /model [number] · /reasoning [level] · /image "path" · /file "path" · /sessions · /resume id · /today · /instructions text · /stop · /exit';
type Message={role:string;text:string};
const accent=(text:string)=>'\x1b[36m'+text+'\x1b[39m';
const muted=(text:string)=>'\x1b[2m'+text+'\x1b[22m';
export class TerminalView extends Container {
 messages:Message[]=[];events:StudyEvent[]=[];locale:'en'|'zh-CN'='en';status='Connecting…';version='1.4 preview';model='';effort='';attached=0;scroll=0;calendarScroll=0;private calendarLeft=0;private paneHeight=0;picker?:CliPicker;
 constructor(public editor:Editor,private rows:()=>number){super();this.addChild(editor);}
 handleMouse(event:TuiMouseEvent):ReturnType<Container['handleMouse']>{
  if(event.type!=='wheel'||event.y<2||event.y>=this.paneHeight+2)return;
  if(this.calendarLeft&&event.x>=this.calendarLeft)this.calendarScroll+=event.wheelDelta||0;
  else this.scroll=Math.max(0,this.scroll-(event.wheelDelta||0));
  return {handled:true,render:true,target:{component:this,originX:0,originY:0,width:event.width,height:event.height}};
 }
 render(width:number):string[]{
  width=Math.max(10,width);
  const side=width>=80?Math.min(28,Math.floor(width*.23)):0,left=Math.max(10,width-(side?side+3:0));
  const mascot=this.messages.length&&!this.picker&&left>=65,chatWidth=mascot?left-17:left;
  const input=this.editor.render(left);
  const status=truncateToWidth(plainTerminalText(this.status)+(this.attached?` · ${this.attached} image(s)`:''),left,'…');
  const header=accent(' ▪ SCORELER')+muted(truncateToWidth(`  ${this.version}  /  STUDY TERMINAL`,Math.max(0,width-11),'…'));
  const available=Math.max(1,this.rows()-input.length-6);
  const welcome=this.locale==='zh-CN'
   ? ['',...scorelerMark.map(accent),'','  从一个问题开始。','  对话、资料和学习工具，与你的桌面应用同步。','','  /model      选择模型','  /reasoning  调整推理强度','  /image      添加图片','  /help       查看命令']
   : ['',...scorelerMark.map(accent),'','  Start with a question.','  Your conversations, materials and study tools, connected.','','  /model      Choose a model','  /reasoning  Set reasoning effort','  /image      Attach an image','  /help       All commands'];
  const transcript=this.messages.length?this.messages.flatMap(m=>[
   accent(' '+plainTerminalText(m.role).toUpperCase()),
   ...new Markdown(plainTerminalText(m.text)||'…',1,0,theme).render(chatWidth),'',
  ]):welcome.flatMap(line=>wrapTextWithAnsi(line,left));
  this.scroll=Math.min(Math.max(0,this.scroll),Math.max(0,transcript.length-available));
  const end=Math.max(0,transcript.length-this.scroll),body=this.picker?this.picker.render(left,available):this.messages.length?transcript.slice(Math.max(0,end-available),end):transcript.slice(0,available);
  while(body.length<available)body.push('');
  if(mascot)for(let i=0;i<body.length;i++)body[i]+=' '.repeat(Math.max(0,chatWidth-visibleWidth(body[i])))+'  '+(smallScorelerMark[i]||'');
  const leftLines=[...body,muted(status),...input];
  this.calendarLeft=side?left+3:0;this.paneHeight=leftLines.length;
  const agenda=calendarLines(this.events,new Date(),this.locale),entries=agenda.slice(3).flatMap(l=>wrapTextWithAnsi(l,side||left));
  const agendaHeight=Math.max(1,leftLines.length-4),maxScroll=Math.max(0,entries.length-agendaHeight);
  this.calendarScroll=Math.min(maxScroll,Math.max(0,this.calendarScroll));
  const day=[agenda[0],agenda[1],'',...entries.slice(this.calendarScroll,this.calendarScroll+agendaHeight)];
  while(day.length<leftLines.length-1)day.push('');
  day.push(maxScroll?truncateToWidth(`${this.calendarScroll>0?'↑':'·'} ${this.calendarScroll+1}–${Math.min(entries.length,this.calendarScroll+agendaHeight)}/${entries.length} ${this.calendarScroll<maxScroll?'↓':''}`,side||left,''): '');
  const combined=side?leftLines.map((line,i)=>line+' '.repeat(Math.max(0,left-visibleWidth(line)))+muted(' │ ')+(i===0?accent(day[i]||''):muted(day[i]||''))):leftLines;
  const model=plainTerminalText(this.model)+(this.effort?' · '+plainTerminalText(this.effort):'');
  return [header,muted('─'.repeat(width)),...combined,muted('─'.repeat(width)),
   truncateToWidth(' '+model,width,'…'),muted(truncateToWidth(' Alt+V image · '+(side?'Alt+↑/↓ agenda · ':'/today agenda · ')+'/help · PgUp/PgDn chat',width,'…'))];
 }
 invalidate(){this.editor.invalidate();}
}

export async function startTerminal({profile,args=[],startApp,clipboard=getNativeClipboard()}:{profile:string;args?:string[];startApp?:()=>void;clipboard?:ReturnType<typeof getNativeClipboard>}){
 if(args.includes('--help')||args.includes('-h')){process.stdout.write('Scoreler terminal\n'+help+'\nImages: /image "C:\\path\\题目.png" or paste a screenshot path with Alt+V (Ctrl+V also attaches images).\n');return;}
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw Error('Open Scoreler CLI in an interactive terminal or PowerShell.');
 process.stdout.write('Connecting to Scoreler…\n');const connection=await CliConnection.open(profile,startApp);
 const terminal=new ProcessTerminal(),tui=new TuiAltScreen(terminal,true,undefined,{mouse:true});
 const editor=new Editor(tui,{borderColor:text=>'\x1b[36m'+text+'\x1b[39m',selectList:{selectedPrefix:identity,selectedText:identity,description:identity,scrollInfo:identity,noMatch:identity}},{paddingX:1});
 const view=new TerminalView(editor,()=>terminal.rows);let state:any,busy=false,closed=false,instructions='',images:CliImage[]=[],documents:Array<{id:string;name:string}>=[];
 const clipboardImages=new ClipboardImages(join(profile,'cli','screenshots'));
 const redraw=()=>tui.requestRender(),message=(text:string)=>{view.messages.push({role:'Scoreler',text});redraw();};
 const refresh=async()=>{state=await connection.request('state');view.events=state.events;view.locale=state.locale;view.version=state.version;view.model=`${state.provider}/${state.model}`;view.effort=state.models.find((m:any)=>m.provider===state.provider&&m.id===state.model)?.effort||'default';redraw();};
 const choose=(title:string,options:Choice[],current:string)=>new Promise<Choice|undefined>(resolve=>{view.picker=new CliPicker(title,options,current,choice=>{view.picker=undefined;resolve(choice);redraw();});redraw();});
 const close=()=>{if(closed)return;closed=true;clearInterval(timer);void connection.request('abort').catch(()=>{}).finally(()=>connection.close());tui.stop();void clipboardImages.close();};
 const pastePath=async()=>{if(busy)throw Error('Wait for this response or use /stop before attaching an image.');const result=await clipboardImages.paste(clipboard,editor.getText(),images.length);if(result){editor.insertTextAtCursor(result.text);view.status=result.image?'Screenshot path inserted. Add your question and press Enter.':'Clipboard text pasted.';view.attached=images.length+clipboardImages.referenced(editor.getText()).length;redraw();}};
 const paste=async()=>{if(!clipboard){message('Use /image "path" to attach an image.');return;}const image=await clipboard.getImage();if(image?.length){if(busy)throw Error('Wait for this response or use /stop before attaching an image.');if(images.length>=5)throw Error('Attach at most five images, each no larger than 10 MB.');images.push(imageFromBytes(normalizeClipboardImage(image)));view.attached=images.length;view.status='Image attached. Enter a question to send it.';}else{const text=await clipboard.getText();if(text)editor.insertTextAtCursor(text);}redraw();};
 const run=async(text:string)=>{
  const parsed=parseCliCommand(text);if(!text.trim())return;
  if(parsed.type==='command'){
   const {name,argument}=parsed;
   if(['exit','quit'].includes(name)){close();return;}
   if(name==='stop'){await connection.request('abort');return;}
   if(name==='help'){message(help);return;}
   if(name==='today'){await refresh();message(calendarLines(view.events,new Date(),view.locale).join('\n'));return;}
   if(name==='answer'){const match=/^(\d+)\s+([\s\S]+)$/.exec(argument),result=await connection.request('answer',{text:match?match[2]:argument,index:match?Number(match[1])-1:0});if(result.pending)message(`Answered ${result.answered}/${result.total}. Use /answer <question number> <text> for the remaining questions.`);return;}
   if(name==='allow'||name==='deny'){await connection.request('permission',{decision:name==='allow'?'allow_once':'deny'});return;}
   if(busy)throw Error('Use /stop before changing the conversation or model.');
   if(name==='new'){await connection.request('new');view.messages=[];instructions='';images=[];documents=[];clipboardImages.clear();view.attached=0;view.status='New conversation';redraw();return;}
   if(name==='model'){
    await refresh();let chosen;
    if(!argument){const selection=await choose(view.locale==='zh-CN'?'选择模型':'Choose model',state.models.map((m:any)=>({value:m.provider+'/'+m.id,label:m.name,description:m.provider+'/'+m.id+(m.input.includes('image')?' · image':'')})),state.provider+'/'+state.model);if(!selection)return;chosen=state.models.find((m:any)=>m.provider+'/'+m.id===selection.value);}
    else chosen=state.models[Number(argument)-1]||state.models.find((m:any)=>m.provider+'/'+m.id===argument);
    if(!chosen)throw Error('Choose a configured model using /model.');view.status='Switching model…';redraw();await connection.request('model',{provider:chosen.provider,model:chosen.id});await refresh();view.status='Ready';message('Model selected: '+view.model);return;
   }
   if(name==='reasoning'){
    await refresh();const model=state.models.find((m:any)=>m.provider===state.provider&&m.id===state.model);
    if(!model?.levels?.length)throw Error('This model does not advertise adjustable reasoning. Choose a supported model with /model.');
    let effort=argument;
    if(!effort){const selection=await choose(view.locale==='zh-CN'?'选择推理强度':'Choose reasoning level',[{value:'default',label:'default',description:'Model default'},...model.levels.map((level:string)=>({value:level,label:level,description:model.name}))],model.effort||'default');if(!selection)return;effort=selection.value;}
    view.status='Changing reasoning…';redraw();await connection.request('reasoning',{effort:effort==='default'?'':effort});await refresh();view.status='Ready';message('Reasoning selected: '+effort);return;
   }
   if(name==='image'){if(images.length>=5)throw Error('At most five images per message.');const path=argument.replace(/^&\s*/, '').replace(/^(["'])(.*)\1$/,'$2');images.push(await readCliImage(path));view.attached=images.length;view.status='Image attached. Enter your question.';redraw();return;}
   if(name==='file'){if(documents.length>=8)throw Error('At most eight files per message.');const path=argument.replace(/^&\s*/, '').replace(/^(["'])(.*)\1$/,'$2');const file=await open(path,'r');try{const stat=await file.stat();if(!stat.isFile()||stat.size>15*1024*1024)throw Error('Study files must be no larger than 15 MB.');const data=await file.readFile();if(data.length!==stat.size)throw Error('File changed while it was read.');const doc=await connection.request('attach',{name:basename(path),data:data.toString('base64')});documents.push(doc);message('File attached: '+doc.name);}finally{await file.close();}return;}
   if(name==='detach'){images=[];documents=[];clipboardImages.clear();view.attached=0;redraw();return;}
   if(name==='instructions'){instructions=argument;message(argument?'Instructions saved for this conversation.':'Conversation instructions cleared.');return;}
   if(name==='sessions'){const data=await connection.request('sessions');const sessions=Array.isArray(data)?data:data.sessions||[];message(sessions.slice(0,30).map((s:any)=>`${s.id}  ${s.name||s.preview||'Conversation'}`).join('\n')||'No conversations.');return;}
   if(name==='resume'){const data=await connection.request('resume',{id:argument});instructions='';images=[];documents=[];clipboardImages.clear();view.attached=0;view.scroll=0;view.status='Conversation resumed';view.messages=(data.messages||[]).filter((m:any)=>m.role==='user'||m.role==='assistant').map((m:any)=>({role:m.role==='user'?'You':'Scoreler',text:typeof m.content==='string'?m.content:''}));redraw();return;}
   throw Error('Unknown command. Use /help.');
  }
  if(busy)throw Error('A response is running. Use /stop first.');const pathImages=clipboardImages.referenced(text);if(images.length+pathImages.length>5)throw Error('At most five images per message.');busy=true;view.scroll=0;view.status='Thinking…';view.messages.push({role:'You',text});const reply={role:'Scoreler',text:''};view.messages.push(reply);redraw();
  const attached=[...images,...pathImages.map(item=>item.image)],files=documents;images=[];documents=[];view.attached=0;
  const prompt=(instructions?`[Instructions for this conversation: ${instructions}]\n\n`:'')+clipboardImages.redactPaths(text)+(files.length?'\n\n'+files.map(doc=>`[${doc.name.replace(/[\[\]]/g,'')}](scoreler-document:${doc.id})`).join('\n'):'');
  try{const result=await connection.request('chat',{text:prompt,images:attached},event=>{if(event.type==='text_delta')reply.text+=event.delta;if(event.type==='tool_start')view.status='Using '+plainTerminalText(event.toolName);if(event.type==='tool_end')view.status=event.isError?'Tool failed: '+event.toolName:'Working…';if(event.type==='question')message(JSON.stringify(event.params)+'\nUse /answer <your answer>.');if(event.type==='permission_request')message(JSON.stringify(event)+'\nUse /allow for this request, or /deny.');redraw();});view.status=result.aborted?'Stopped':'Ready';clipboardImages.clear();}
  catch(error){images=attached.filter(image=>!pathImages.some(item=>item.image===image));documents=files;view.attached=images.length;throw error;}
  finally{busy=false;await refresh().catch(()=>{});redraw();}
 };
 editor.onSubmit=text=>{editor.addToHistory(text);editor.setText('');void run(text).catch(error=>{view.status='Request failed';message(/401|INVALID_TOKEN/.test(error.message)?'The selected provider rejected its credentials (401). Reconnect that provider in Scoreler Settings, or choose another configured model with /model.':error.message);});};
 tui.addInputListener(data=>{if(view.picker){view.picker.handleInput(data);redraw();return {consume:true};}if(matchesKey(data,'ctrl+c')){if(busy)void connection.request('abort').catch(()=>{});else close();return {consume:true};}if(matchesKey(data,'ctrl+d')&&!editor.getText()){close();return {consume:true};}if(matchesKey(data,'alt+v')){void pastePath().catch(error=>message(error.message));return {consume:true};}if(matchesKey(data,'alt+up')||matchesKey(data,'alt+down')){view.calendarScroll+=matchesKey(data,'alt+up')?-3:3;redraw();return {consume:true};}if(matchesKey(data,'ctrl+v')){void paste().catch(error=>message(error.message));return {consume:true};}if(matchesKey(data,'pageUp')){view.scroll+=10;redraw();return {consume:true};}if(matchesKey(data,'pageDown')){view.scroll=Math.max(0,view.scroll-10);redraw();return {consume:true};}return undefined;});
 tui.setLayoutRoot(view);tui.setFocus(editor);const timer=setInterval(()=>{if(!busy)void refresh().catch(()=>{view.status='Disconnected. Reopen scoreler after the app restarts.';redraw();});},30000);
 try{await refresh();await connection.request('new');view.status='Ready · /help for commands';tui.start();}catch(error){clearInterval(timer);connection.close();throw error;}
 process.once('SIGTERM',close);process.once('SIGHUP',close);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const profile=process.env.SCORELER_PROFILE;if(!profile)process.stderr.write('Start this CLI using the optional scoreler command installed from Settings.\n');else void startTerminal({profile,args:process.argv.slice(2)}).catch(error=>{process.stderr.write('Scoreler: '+error.message+'\n');process.exitCode=1;});}
