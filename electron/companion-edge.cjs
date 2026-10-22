const inside=(p,b,pad=0)=>p.x>=b.x-pad&&p.x<=b.x+b.width+pad&&p.y>=b.y-pad&&p.y<=b.y+b.height+pad;
function nearestEdge(b,area){return Math.abs(b.x-area.x)<=Math.abs(area.x+area.width-b.x-b.width)?'left':'right';}
function dockBounds(b,area,edge){return {...b,x:edge==='left'?area.x:area.x+area.width-b.width};}
function atEdge(p,b,area,edge){const x=edge==='left'?area.x:area.x+area.width-1;return Math.abs(p.x-x)<=4&&p.y>=b.y&&p.y<=b.y+b.height;}
function tabBounds(b,area,edge){return {x:edge==='left'?area.x:area.x+area.width-8,y:Math.round(Math.max(area.y,Math.min(area.y+area.height-58,b.y+b.height/2-29))),width:8,height:58};}
module.exports={inside,nearestEdge,dockBounds,atEdge,tabBounds};
