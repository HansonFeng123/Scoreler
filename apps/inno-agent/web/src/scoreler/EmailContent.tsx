import {useEffect,useMemo,useRef,useState} from 'react';
import DOMPurify from 'dompurify';
export function emailDocument(html:string){
 const clean=DOMPurify.sanitize(html,{WHOLE_DOCUMENT:true,FORBID_TAGS:['script','iframe','object','embed','form','input','button','textarea','select','meta','base','link','svg','math','video','audio'],FORBID_ATTR:['srcset','background'],ALLOW_DATA_ATTR:false});
 const document=new DOMParser().parseFromString(clean,'text/html');
 document.querySelectorAll('a').forEach(a=>{const href=a.getAttribute('href')??'';if(!/^(https?:|mailto:|#)/i.test(href.trim()))a.removeAttribute('href');a.removeAttribute('target');});
 const policy=document.createElement('meta');policy.httpEquiv='Content-Security-Policy';policy.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; base-uri 'none'; form-action 'none'";document.head.prepend(policy);
 const fallback=document.createElement('style');fallback.textContent='html{color-scheme:light}body{margin:0;padding:16px;overflow-wrap:anywhere}img{max-width:100%;height:auto}';document.head.prepend(fallback);
 return '<!doctype html>'+document.documentElement.outerHTML;
}
export function EmailContent({html,text,en,openLink}:{html?:string;text:string;en:boolean;openLink:(url:string)=>void}){
 const source=useMemo(()=>html?emailDocument(html):'', [html]),frame=useRef<HTMLIFrameElement>(null),[height,setHeight]=useState(600);
 useEffect(()=>{setHeight(600);},[source]);
 useEffect(()=>{const iframe=frame.current;if(!iframe)return;let observer:ResizeObserver|undefined,doc:Document|null=null;
 const click=(event:MouseEvent)=>{const anchor=(event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement|null;if(!anchor)return;const href=anchor.getAttribute('href')??'';if(href.startsWith('#'))return;event.preventDefault();event.stopPropagation();if(/^(https?:|mailto:)/i.test(href))openLink(href);};
 const loaded=()=>{doc?.removeEventListener('click',click,true);observer?.disconnect();doc=iframe.contentDocument;if(!doc)return;doc.addEventListener('click',click,true);const resize=()=>setHeight(Math.min(1400,Math.max(350,doc!.documentElement.scrollHeight)));observer=new ResizeObserver(resize);if(doc.body)observer.observe(doc.body);resize();};
 iframe.addEventListener('load',loaded);if(iframe.contentDocument?.readyState==='complete')loaded();return()=>{iframe.removeEventListener('load',loaded);doc?.removeEventListener('click',click,true);observer?.disconnect();};
 },[source,openLink]);
 if(source)return <iframe ref={frame} className="email-html-frame" title={en?'Original formatted email':'邮件原始排版'} sandbox="allow-same-origin" referrerPolicy="no-referrer" srcDoc={source} style={{height}}/>;
 return <div className="email-plain-text">{text.split(/(https?:\/\/[^\s<>\[\]]+)/gi).map((part,index)=>/^https?:\/\//i.test(part)?<a key={index} href={part} onClick={event=>{event.preventDefault();openLink(part);}}>{part}</a>:part)}</div>;
}
