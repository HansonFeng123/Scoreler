import {exportStudyHtml} from './studyExport.js';
import type {ExportFormat} from './ExportMenu.js';
import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {Streamdown} from 'streamdown';
import {createMathPlugin} from '@streamdown/math';
import {cjk} from '@streamdown/cjk';
import type {PracticeTest} from '../../../src/scoreler/store.js';
const math=createMathPlugin({singleDollarTextMath:true});
export async function downloadPracticePdf(exam:PracticeTest,locale:string,format:ExportFormat='pdf'){
 const host=document.createElement('div');host.style.cssText='position:fixed;left:-10000px;top:0;width:720px';document.body.append(host);const root=createRoot(host);
 try{
 flushSync(()=>root.render(<main className="practice-paper"><header><small>Scoreler · {locale==='en'?'General practice · Not an official IB paper':'一般练习 · 非 IB 官方试卷'}</small><h1>{exam.title}</h1><p>{exam.subject} · {exam.minutes} {locale==='en'?'minutes':'分钟'} · {exam.questions.reduce((n,q)=>n+q.marks,0)} {locale==='en'?'marks':'分'}</p><p>{locale==='en'?'Name: ____________________   Date: ____________________':'姓名：____________________   日期：____________________'}</p></header><Streamdown plugins={{math,cjk}} controls={false}>{exam.instructions}</Streamdown>{exam.questions.map((q,i)=><section className="paper-question" key={i}><h2>{i+1}. {q.topic} <span> [{q.marks} {locale==='en'?'marks':'分'}]</span></h2><Streamdown plugins={{math,cjk}} controls={false}>{q.prompt}</Streamdown><div className="paper-answer-space" style={{height:Math.min(240,Math.max(100,q.marks*30))}}/></section>)}</main>));
 await new Promise(r=>setTimeout(r,350));await document.fonts.ready;
 const css=Array.from(document.styleSheets).map(s=>{try{return Array.from(s.cssRules).map(r=>r.cssText).join('\n');}catch{return '';}}).join('\n')+`@page{size:A4;margin:18mm}html,body{background:white!important;color:#161616!important;font-family:Arial,'Microsoft YaHei',sans-serif;font-size:11pt}body{margin:0}.practice-paper h1{font-size:20pt;margin:12pt 0}.practice-paper h2{font-size:12pt;margin:0 0 10pt}.practice-paper p{color:inherit;font-size:11pt;line-height:1.7;margin:8pt 0}.practice-paper header{border-bottom:1px solid #bbb;margin-bottom:20pt;padding-bottom:10pt}.practice-paper small{color:#666;font-size:9pt}.paper-question{margin:20pt 0;break-inside:avoid-page}.paper-question h2 span{font-weight:normal}.paper-answer-space{margin-top:12pt;background:repeating-linear-gradient(to bottom,transparent 0,transparent 27px,#ddd 28px,transparent 29px)}.practice-paper table{border-collapse:collapse;width:100%}.practice-paper td,.practice-paper th{border:1px solid #bbb;padding:6pt}.practice-paper img{max-width:100%}.practice-paper pre{white-space:pre-wrap}.practice-paper .katex{font-size:1.05em}`;
 const html='<!doctype html><html lang="'+locale+'"><head><meta charset="utf-8"><base href="'+location.origin+'/"><style>'+css.replace(/<\/style/gi,'')+'</style></head><body>'+host.innerHTML+'</body></html>';
 if(window.scorelerDesktop){await exportStudyHtml(html,exam.title,format);}else{const w=window.open('','_blank');if(!w)throw new Error(locale==='en'?'Allow the print window to save PDF':'请允许弹出打印窗口以保存 PDF');w.document.write(html);w.document.close();await w.document.fonts.ready;w.print();}
 }finally{root.unmount();host.remove();}
}
