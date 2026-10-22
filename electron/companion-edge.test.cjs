const {test}=require('node:test'),assert=require('node:assert/strict');
const {nearestEdge,dockBounds,atEdge,inside}=require('./companion-edge.cjs');
test('docks to the nearest horizontal edge on monitors with negative coordinates',()=>{
 const a={x:-1920,y:-120,width:1920,height:1080},b={x:-1800,y:40,width:340,height:490};
 assert.equal(nearestEdge(b,a),'left');assert.equal(dockBounds(b,a,'left').x,-1920);
 assert.equal(dockBounds(b,a,'right').x,-340);
});
test('reveals only at the selected edge beside the pet and allows a leave tolerance',()=>{
 const a={x:0,y:0,width:1920,height:1080},b={x:1580,y:200,width:340,height:490};
 assert.equal(atEdge({x:1919,y:400},b,a,'right'),true);
 assert.equal(atEdge({x:1919,y:100},b,a,'right'),false);
 assert.equal(atEdge({x:0,y:400},b,a,'right'),false);
 assert.equal(inside({x:1575,y:400},b,12),true);
 assert.equal(inside({x:1500,y:400},b,12),false);
});
