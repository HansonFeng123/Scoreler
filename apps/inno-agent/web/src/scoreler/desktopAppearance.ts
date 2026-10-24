let generation=0;
export async function syncDesktopAppearance(value:{reasoning?:string;palette:string;theme:string;locale:string;variables:Record<string,string>;image?:string}){
 const current=++generation;
 if(!window.scorelerDesktop?.syncAppearance)return;
 const colors=getComputedStyle(document.documentElement),color=(key:string)=>colors.getPropertyValue(key).trim();
 const face=({sage:'M11 16h3v4h-3zm8 0h3v4h-3zM15 21h3v2h-3z',ocean:'M10 17h2v-2h2v2h2v2h-2v-2h-2v2h-2zm8 0h2v-2h2v2h2v2h-2v-2h-2v2h-2zM14 21h6v2h-2v1h-2v-1h-2z',lavender:'M10 17h6v2h-6zm10-1h3v4h-3zM14 21h5v2h-5zm3 2h3v1h-3z',amber:'M10 16h2v-2h2v2h2v2h-2v2h-2v-2h-2zm9 0h2v-2h2v2h2v2h-2v2h-2v-2h-2zM14 21h6v3h-6z'} as Record<string,string>)[value.palette]||'M11 16h3v4h-3zm8 0h3v4h-3zM15 21h3v2h-3z';
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><path fill="'+color('--pet-outline')+'" d="M8 5h5v3h6V5h5v5h3v4h2v10h-3v3h-5v-2H11v2H6v-3H3V14h2v-4h3z"/><path fill="'+color('--pet-body')+'" d="M9 8h3v3h8V8h3v5h3v10h-3v2h-2v-3H11v3H9v-2H6V13h3z"/><path fill="'+color('--pet-shine')+'" d="M9 12h13v2H9zM7 14h2v5H7z"/><path fill="'+color('--pet-cheek')+'" d="M8 20h3v2H8zm14 0h3v2h-3z"/><path fill="'+color('--pet-eyes')+'" d="'+face+'"/></svg>';
 const icon=await new Promise<string>((resolve,reject)=>{const img=new Image();img.onload=()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx){reject(Error('Icon canvas unavailable'));return;}ctx.imageSmoothingEnabled=false;ctx.drawImage(img,0,0,256,256);resolve(canvas.toDataURL('image/png'));};img.onerror=reject;img.src='data:image/svg+xml;base64,'+btoa(svg);});
 if(current===generation)await window.scorelerDesktop.syncAppearance({...value,icon});
}
