export const pageFeatures=['home','assistant','calendar','library','exams','mistakes','notes','videos','email','browser'] as const;
export const toolFeatures=['dictation','capsules','calculator','timer','stopwatch','startup','wheel','markdown','number'] as const;
export type ToolFeature=typeof toolFeatures[number];
export type FeatureId=typeof pageFeatures[number]|ToolFeature;
export interface FeatureLayout {sidebar:FeatureId[];toolbox:FeatureId[]}
export const defaultFeatureLayout=():FeatureLayout=>({sidebar:[...pageFeatures],toolbox:[...toolFeatures]});
export function featureLayout(value:unknown):FeatureLayout {const all=[...pageFeatures,...toolFeatures],raw=value as Partial<FeatureLayout>|null,seen=new Set<string>();const clean=(items:unknown):FeatureId[]=>Array.isArray(items)?items.slice(0,100).filter((id):id is FeatureId=>typeof id==='string'&&all.includes(id as FeatureId)&&!seen.has(id)&&!!seen.add(id)):[];const sidebar=clean(raw?.sidebar),toolbox=clean(raw?.toolbox);for(const id of all)if(!seen.has(id))(pageFeatures.includes(id as typeof pageFeatures[number])?sidebar:toolbox).push(id);return {sidebar,toolbox};}
export function moveFeature(layout:FeatureLayout,id:FeatureId,zone:keyof FeatureLayout,before?:FeatureId):FeatureLayout {if(id===before)return layout;const next=featureLayout(layout);next.sidebar=next.sidebar.filter(x=>x!==id);next.toolbox=next.toolbox.filter(x=>x!==id);const index=before?next[zone].indexOf(before):-1;next[zone].splice(index<0?next[zone].length:index,0,id);return next;}
