import {modelChoices} from './modelChoices.js';
import {useEffect,useState} from 'react';
import {getSettings,switchBackendModel,upsertProvider} from '../api/settings.js';
import type {InnoSettings} from '../types/settings.js';
import {setReasoningMood} from './reasoningMood.js';
export function ModelPicker({en,disabled,notice}:{en:boolean;disabled:boolean;notice:(s:string)=>void}){
 const [settings,setSettings]=useState<InnoSettings|null>(null),[changing,setChanging]=useState(false),[gpt,setGpt]=useState<any>();
 const load=()=>getSettings().then(s=>{setSettings(s);const m=s.providers[s.defaultProvider]?.models.find(m=>m.id===s.defaultModel);if(s.defaultProvider!=='scoreler-chatgpt')setReasoningMood(m?.reasoningLevel||'');}).catch(e=>notice(String(e)));
 useEffect(()=>{void load();const fn=()=>void load();window.addEventListener('scoreler-model-changed',fn);return()=>window.removeEventListener('scoreler-model-changed',fn);},[]);
 useEffect(()=>{if(settings?.defaultProvider==='scoreler-chatgpt')void window.scorelerDesktop?.chatgpt?.('state').then(s=>{setGpt(s);setReasoningMood(s.effort||'');}).catch(()=>{});},[settings?.defaultProvider,settings?.defaultModel]);
 const provider=settings?.providers[settings.defaultProvider],model=provider?.models.find(m=>m.id===settings?.defaultModel),isGPT=settings?.defaultProvider==='scoreler-chatgpt';
 let isDeepSeek=false;try{isDeepSeek=!!provider&&new URL(provider.baseUrl).origin==='https://api.deepseek.com'&&['deepseek-flash','deepseek-v4-pro'].includes(model?.id||'')&&['openai-completions','openai-responses',undefined].includes(provider.api);}catch{}
 const levels:string[]=isGPT?gpt?.models?.find((m:any)=>m.slug===model?.id)?.reasoningLevels??[]:isDeepSeek?['none','low','high','max']:[];
 const currentEffort=isGPT?gpt?.effort||'':model?.reasoningLevel||'';
 const changeEffort=async(level:string)=>{if(!settings||!provider||!model)return;setChanging(true);try{
  if(isGPT){const next=await window.scorelerDesktop?.chatgpt?.('select',{model:model.id,effort:level});setGpt(next);}
  else setSettings(await upsertProvider({providerId:settings.defaultProvider,baseUrl:provider.baseUrl,api:provider.api||'openai-completions',apiKey:'',preserveApiKey:true,headers:provider.headers,authHeader:provider.authHeader,bypassProxy:provider.bypassProxy,models:provider.models.map(m=>m.id===model.id?{...m,reasoning:true,reasoningLevel:level as any}:m)}));
  setReasoningMood(level);
 }catch{notice(en?'Could not save this reasoning level.':'无法保存此推理档位。');}finally{setChanging(false);}};
 return <div className="chat-model-controls"><div className="chat-model-selects"><select className="chat-model-picker" aria-label={en?'Chat model':'对话模型'} value={settings?JSON.stringify([settings.defaultProvider,settings.defaultModel]):''} disabled={disabled||changing||!settings} onFocus={()=>void load()} onChange={e=>{const [provider,model]=JSON.parse(e.target.value);setChanging(true);void (async()=>{if(provider==='scoreler-chatgpt')await window.scorelerDesktop?.chatgpt?.('select',{model,effort:''});const next=await switchBackendModel(provider,model);setSettings(s=>s?{...s,...next}:s);})().catch(()=>notice(en?'Refresh ChatGPT models in Settings first.':'请先在设置中刷新 ChatGPT 模型。')).finally(()=>setChanging(false));}}>{!settings&&<option value="">{en?'Loading models…':'加载模型…'}</option>}{settings&&modelChoices(settings).map(m=><option key={m.provider+m.id} value={JSON.stringify([m.provider,m.id])}>{m.name}</option>)}{settings&&!modelChoices(settings).length&&<option value="">{en?'Add a model in Settings':'请在设置中添加模型'}</option>}</select>
 {!!levels.length&&<select className="chat-model-picker reasoning-picker" aria-label={en?'Reasoning level':'推理强度'} value={currentEffort} disabled={disabled||changing} onChange={e=>void changeEffort(e.target.value)}><option value="">{en?'Reasoning: default':'推理：默认'}</option>{levels.map(level=><option key={level} value={level}>{(en?'Reasoning: ':'推理：')+(level==='none'?(en?'Off':'关闭'):level)}</option>)}</select>}
 </div>{isGPT&&<div className="chatgpt-plan-info"><span>{en?'Using ChatGPT plan':'使用 ChatGPT 套餐'}</span><button type="button" className="text-button" onClick={()=>void window.scorelerDesktop?.chatgpt?.('usage')}>{en?'Manage usage':'管理用量'}</button></div>}</div>;
}
