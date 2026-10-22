import {featureCatalog} from './featureCatalog.js';
import {featureDragType,draggedFeature} from './useFeatureLayout.js';
import {type FeatureLayout,type FeatureId,type ToolFeature} from '../../../src/scoreler/feature-layout.js';
import {Dictation} from './Dictation.js';
import {MemoryCapsules} from './MemoryCapsules.js';
import {Calculator} from './Calculator.js';
import {TimeTools} from './TimeTools.js';
import {StartupGuide} from './StartupGuide.js';
import type {SetupTopic} from '../../../src/scoreler/startup-guide-data.js';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Download,FileText,RotateCw,Dices,BookOpen,Timer,Clock3,Pill,Calculator as CalculatorIcon} from 'lucide-react';
import {Streamdown} from 'streamdown';
import {createMathPlugin} from '@streamdown/math';
import {cjk} from '@streamdown/cjk';
import {exportStudyHtml} from './studyExport.js';
import {mathMarkdown} from './mathMarkdown.js';
const math=createMathPlugin({singleDollarTextMath:true});
type Tool=ToolFeature;
const colors=['var(--wheel-1)','var(--wheel-2)','var(--wheel-3)','var(--wheel-4)','var(--wheel-5)','var(--wheel-6)'];
export function randomInteger(min:number,max:number){
  const span=max-min+1;if(!Number.isSafeInteger(min)||!Number.isSafeInteger(max)||span<1||span>4294967296)throw Error('Invalid range');
  const limit=Math.floor(4294967296/span)*span;let value:number;
  do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
  return min+value%span;
}
export function Toolbox({locale,notice,openSetup,ask,startupRequest=0,toolRequest,onToolChange,dictationId,layout,move,resetLayout,openFeature,browserEnabled=false,onDragChange}:{locale:string;notice:(s:string)=>void;openSetup?:(topic:SetupTopic)=>void;ask?:(text:string)=>void;startupRequest?:number;toolRequest?:{id:ToolFeature|null;key:number};onToolChange?:(id:ToolFeature|null)=>void;dictationId?:string;layout?:FeatureLayout;move?:(id:FeatureId,zone:keyof FeatureLayout,before?:FeatureId)=>void;resetLayout?:()=>void;openFeature?:(id:FeatureId)=>void;browserEnabled?:boolean;onDragChange?:(active:boolean)=>void}){
  const en=locale==='en',[tool,setTool]=useState<Tool|null>(null);
  useEffect(()=>{if(startupRequest)setTool('startup');},[startupRequest]);
  useEffect(()=>{if(toolRequest)setTool(toolRequest.id);},[toolRequest?.key]);
  useEffect(()=>onToolChange?.(tool),[tool]);
  const tools=[{id:'dictation' as const,icon:FileText,title:en?'Dictation practice':'听写与默写',detail:en?'Generate a sheet, submit answers and export your practice.':'AI 出题、提交批改并导出练习。'},{id:'capsules' as const,icon:Pill,title:en?'Memory capsules':'记忆胶囊',detail:en?'Keep small reminders and everyday memories.':'存放随手备忘与日常小事。'},{id:'calculator' as const,icon:CalculatorIcon,title:en?'Calculator':'计算器',detail:en?'Calculate with parentheses and percentages.':'支持括号、百分数的日常计算。'},{id:'timer' as const,icon:Timer,title:en?'Countdown timer':'倒计时',detail:en?'Set a focus session with a gentle finish reminder.':'设定专注时长，到时提醒你休息。'},{id:'stopwatch' as const,icon:Clock3,title:en?'Stopwatch':'秒表',detail:en?'Time your practice, pause and continue.':'记录练习用时，随时暂停和继续。'},{id:'startup' as const,icon:BookOpen,title:en?'Startup toolkit':'启动工具包',detail:en?'Set up models, search, email and learn what AI can do.':'配置模型、搜索、邮箱，了解 AI 的使用方法。'},{id:'wheel' as const,icon:RotateCw,title:en?'Spin wheel':'幸运转盘',detail:en?'Add choices and let the wheel decide.':'输入选项，让转盘帮你做决定。'},
    {id:'markdown' as const,icon:FileText,title:en?'Markdown to PDF':'Markdown 转 PDF',detail:en?'Preview Markdown and export a clean PDF.':'粘贴或导入 Markdown，预览后导出 PDF。'},
    {id:'number' as const,icon:Dices,title:en?'Random number':'随机数',detail:en?'Pick an integer within your chosen range.':'在指定范围内随机抽取一个整数。'}];
  return <><div className="page-heading"><div><h1>{tool==='capsules'?(en?'Memory capsules':'记忆胶囊'):(en?'Toolbox':'百宝箱')}</h1><p>{en?'Small tools for everyday study.':'学习中的小工具，随手打开就能用。'}</p></div><div className="button-row">{resetLayout&&<button className="text-button" onClick={resetLayout}>{en?'Reset layout':'恢复默认布局'}</button>}{tool&&<button className="secondary" onClick={()=>setTool(null)}><ArrowLeft size={16}/>{en?'All tools':'全部工具'}</button>}</div></div>
    {!tool?<><p className="quiet-note">{en?'Drag to reorder, or move functions between the sidebar and this toolbox. Drop a sidebar item onto the Toolbox icon to move it here.':'拖动可调整顺序，也可在侧栏与百宝箱之间移动功能。将侧栏功能拖到百宝箱图标即可移入。'}</p><div className="toolbox-grid" onDragOver={e=>{if(e.dataTransfer.types.includes(featureDragType))e.preventDefault();}} onDrop={e=>{const id=draggedFeature(e);if(id){e.preventDefault();move?.(id,'toolbox');onDragChange?.(false);}}}>{(layout?.toolbox??tools.map(t=>t.id)).filter(id=>id!=='browser'||browserEnabled).map(id=>{const item=featureCatalog[id],Icon=item.icon,existing=tools.find(t=>t.id===id);return <button className="panel toolbox-tile" key={id} draggable={!!move} title={en?'Drag to move or reorder':'拖动可移动或调整顺序'} onDragStart={e=>{e.dataTransfer.setData(featureDragType,id);e.dataTransfer.effectAllowed='move';onDragChange?.(true);}} onDragEnd={()=>onDragChange?.(false)} onDragOver={e=>{if(e.dataTransfer.types.includes(featureDragType))e.preventDefault();}} onDrop={e=>{const moved=draggedFeature(e);if(moved){e.preventDefault();e.stopPropagation();move?.(moved,'toolbox',id);onDragChange?.(false);}}} onClick={()=>existing?setTool(existing.id):openFeature?.(id)}><Icon size={25}/><strong>{en?item.en:item.zh}</strong><span>{existing?.detail||(en?'Open this study section.':'打开这个学习功能。')}</span></button>;})}</div></>:tool==='dictation'?<Dictation en={en} notice={notice} sheetId={dictationId} ask={ask}/>:tool==='capsules'?<MemoryCapsules locale={locale} notice={notice} embedded/>:tool==='calculator'?<Calculator en={en}/>:tool==='startup'?<StartupGuide en={en} open={openSetup} ask={ask}/>:tool==='wheel'?<SpinWheel en={en}/>:tool==='markdown'?<MarkdownPdf en={en} notice={notice}/>:tool==='timer'||tool==='stopwatch'?<TimeTools en={en} mode={tool}/>:<RandomNumber en={en}/>}</>;
}
function SpinWheel({en}:{en:boolean}){
  const [text,setText]=useState('A\nB\nC\nD'),[rotation,setRotation]=useState(0),[busy,setBusy]=useState(false),[result,setResult]=useState('');
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);useEffect(()=>()=>clearTimeout(timer.current),[]);
  const options=text.split('\n').map(s=>s.trim()).filter(Boolean),valid=options.length>=2&&options.length<=30;
  const spin=()=>{if(!valid||busy)return;const index=randomInteger(0,options.length-1),target=(360-(index+.5)*360/options.length)%360;
    const next=rotation+1440+(target-rotation%360+360)%360;setRotation(next);setBusy(true);setResult('');
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    timer.current=setTimeout(()=>{setBusy(false);setResult(options[index]);},reduced?0:3200);
  };
  return <div className="panel toolbox-wheel-layout"><div><h2>{en?'Spin wheel':'幸运转盘'}</h2><label>{en?'One choice per line (2–30)':'每行一个选项（2–30 项）'}<textarea rows={9} maxLength={3000} disabled={busy} value={text} onChange={e=>{setText(e.target.value);setResult('');}}/></label><button className="primary" disabled={!valid||busy} onClick={spin}><RotateCw size={16}/>{busy?(en?'Spinning…':'转动中…'):(en?'Spin':'转一转')}</button></div><div className="toolbox-wheel-stage"><span className="toolbox-pointer" aria-hidden="true">▼</span><div className="toolbox-wheel" style={{transform:`rotate(${rotation}deg)`,background:`conic-gradient(${(options.length?options:['']).map((_,i)=>`${colors[i%colors.length]} ${i*100/(options.length||1)}% ${(i+1)*100/(options.length||1)}%`).join(',')})`}} aria-hidden="true">{options.slice(0,30).map((option,i)=><span key={i} style={{transform:`rotate(${(i+.5)*360/options.length}deg) translateY(-92px) rotate(-${(i+.5)*360/options.length}deg)`}}>{option.slice(0,8)}</span>)}</div><p className="toolbox-result" role="status">{result?(en?'Result: ':'结果：')+result:en?'Your result appears here':'抽取结果会显示在这里'}</p></div></div>;
}
function RandomNumber({en}:{en:boolean}){
  const [min,setMin]=useState('1'),[max,setMax]=useState('100'),[result,setResult]=useState<number|null>(null);
  const a=Number(min),b=Number(max),valid=min!==''&&max!==''&&Number.isSafeInteger(a)&&Number.isSafeInteger(b)&&b>=a&&b-a<4294967296;
  return <section className="panel toolbox-number"><h2>{en?'Random number':'随机数'}</h2><div className="button-row"><label>{en?'Minimum':'最小值'}<input type="number" step="1" value={min} onChange={e=>setMin(e.target.value)}/></label><label>{en?'Maximum':'最大值'}<input type="number" step="1" value={max} onChange={e=>setMax(e.target.value)}/></label></div><p>{en?'Both endpoints are included. Use whole numbers, with a range below 2³².':'包含最小值和最大值。请输入整数，范围差值需小于 2³²。'}</p><button className="primary" disabled={!valid} onClick={()=>setResult(randomInteger(a,b))}><Dices size={16}/>{en?'Draw':'抽取'}</button><p className="toolbox-result" role="status">{result??'—'}</p></section>;
}
function MarkdownPdf({en,notice}:{en:boolean;notice:(s:string)=>void}){
  const [text,setText]=useState(''),[title,setTitle]=useState(''),[busy,setBusy]=useState(false),preview=useRef<HTMLDivElement>(null);
  const save=async()=>{setBusy(true);try{await document.fonts.ready;const content=preview.current!.cloneNode(true) as HTMLElement;
    content.querySelectorAll('script,iframe,object,embed,input,button').forEach(n=>n.remove());
    content.querySelectorAll('*').forEach(n=>{for(const attr of [...n.attributes])if(/^on/i.test(attr.name)||/^(javascript|vbscript):/i.test(attr.value.trim()))n.removeAttribute(attr.name);});
    const mathCss=[...document.styleSheets].map(s=>{try{return [...s.cssRules].map(r=>r.cssText).join('\n');}catch{return '';}}).join('\n');
    const css=`${mathCss}\n@page{size:A4;margin:18mm}html,body{background:white!important;color:#202020!important}body{margin:0;font:11pt Arial,'Microsoft YaHei',sans-serif}.toolbox-md-preview{padding:0!important;background:white!important;color:#202020!important;overflow:visible!important}.toolbox-md-preview *{color:inherit}p,li{line-height:1.7}h1,h2,h3{break-after:avoid}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f3f3;padding:12px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:7px}img{max-width:100%}blockquote{border-left:3px solid #aaa;padding-left:12px}.katex{font-size:1.05em}`;
    await exportStudyHtml('<!doctype html><html><head><meta charset="utf-8"><base href="'+location.origin+'/"><style>'+css.replace(/<\/style/gi,'')+'</style></head><body>'+content.outerHTML+'</body></html>',title.trim()||(en?'Markdown document':'Markdown 文档'),'pdf');
  }catch(e){notice(String(e));}finally{setBusy(false);}};
  return <section className="toolbox-markdown"><div className="panel toolbox-md-actions"><label>{en?'File name':'文件名'}<input value={title} maxLength={120} onChange={e=>setTitle(e.target.value)} placeholder={en?'Markdown document':'Markdown 文档'}/></label><label className="secondary toolbox-import">{en?'Import .md':'导入 .md'}<input type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>2000000){notice(en?'Choose a file smaller than 2 MB.':'请选择小于 2 MB 的文件。');return;}try{setText(await file.text());setTitle(file.name.replace(/\.(md|markdown|txt)$/i,''));}catch(error){notice(String(error));}e.target.value='';}}/></label><button className="primary" disabled={busy||!text.trim()} onClick={()=>void save()}><Download size={16}/>{busy?(en?'Exporting…':'导出中…'):(en?'Export PDF':'导出 PDF')}</button></div><div className="toolbox-md-columns"><label className="panel">Markdown<textarea rows={22} maxLength={2000000} value={text} onChange={e=>setText(e.target.value)} placeholder={en?'# Paste Markdown here':'# 在这里输入 Markdown'}/></label><section className="panel"><h2>{en?'Preview':'预览'}</h2><div className="toolbox-md-preview" ref={preview}><Streamdown mode="static" tableMaxHeight="none" plugins={{math,cjk}} controls={false}>{mathMarkdown(text)}</Streamdown></div></section></div></section>;
}
