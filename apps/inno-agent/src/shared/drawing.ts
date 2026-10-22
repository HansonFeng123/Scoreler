export type Point={x:number;y:number};
export type InkColor='#202124'|'#df3434'|'#1875df';
export type DrawingElement={id:string;kind:'ink'|'line'|'rectangle'|'ellipse'|'text'|'image';color:InkColor;points:Point[];text?:string;fontSize?:16|24|32;bold?:boolean;imageData?:string};
export interface DrawingNote{version:1;width:1600;height:1000;elements:DrawingElement[]}
export const emptyDrawing=():DrawingNote=>({version:1,width:1600,height:1000,elements:[]});
const distance=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y);
export function recognizeShape(points:Point[]):Pick<DrawingElement,'kind'|'points'>{
 const a=points[0],b=points[points.length-1];if(points.length<3)return {kind:'line',points:[a,b]};
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,diagonal=Math.hypot(w,h);
 let length=0;for(let i=1;i<points.length;i++)length+=distance(points[i-1],points[i]);
 if(w<8||h<8||distance(a,b)>diagonal*.4||length<diagonal*1.6)return {kind:'line',points:[a,b]};
 const edge=points.reduce((sum,p)=>sum+Math.min((p.x-x)/Math.max(w,1),(x+w-p.x)/Math.max(w,1),(p.y-y)/Math.max(h,1),(y+h-p.y)/Math.max(h,1)),0)/points.length;
 if(edge<.025)return {kind:'rectangle',points:[{x,y},{x:x+w,y:y+h}]};
 const size=Math.max(w,h),round=Math.min(w,h)/size>.82;return {kind:'ellipse',points:[{x,y},{x:x+(round?size:w),y:y+(round?size:h)}]};
}
function segmentDistance(p:Point,a:Point,b:Point){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}
export function hitElement(e:DrawingElement,p:Point){const a=e.points[0],b=e.points[e.points.length-1];if(e.kind==='text')return p.x>=a.x-5&&p.x<=a.x+Math.max(...(e.text??'').split('\n').map(s=>s.length))*15+10&&p.y>=a.y-25&&p.y<=a.y+(e.text??'').split('\n').length*30;
 if(e.kind==='ink'||e.kind==='line')return e.points.some((v,i)=>i>0&&segmentDistance(p,e.points[i-1],v)<9);
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),w=Math.abs(a.x-b.x),h=Math.abs(a.y-b.y);if(e.kind==='rectangle'||e.kind==='image')return p.x>=x-8&&p.x<=x+w+8&&p.y>=y-8&&p.y<=y+h+8;
 return ((p.x-x-w/2)/(w/2+8))**2+((p.y-y-h/2)/(h/2+8))**2<=1;
}
export function validDrawing(raw:unknown):raw is DrawingNote{const n=raw as DrawingNote;return !!n&&n.version===1&&n.width===1600&&n.height===1000&&Array.isArray(n.elements)&&n.elements.length<=10000&&n.elements.every(e=>typeof e.id==='string'&&['ink','line','rectangle','ellipse','text','image'].includes(e.kind)&&['#202124','#df3434','#1875df'].includes(e.color)&&Array.isArray(e.points)&&e.points.length>=1&&e.points.length<=20000&&e.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))&&(e.kind!=='image'||e.points.length===2&&typeof e.imageData==='string'&&e.imageData.length<=6500000&&/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(e.imageData))&&(e.fontSize===undefined||[16,24,32].includes(e.fontSize))&&(e.bold===undefined||typeof e.bold==='boolean')&&(e.text===undefined||typeof e.text==='string'&&e.text.length<=10000));}
