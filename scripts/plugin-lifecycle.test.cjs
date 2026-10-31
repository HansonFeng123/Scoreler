const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {openSandbox}=require('../electron/plugins.cjs');
test('embedded plugin close is idempotent after its parent is destroyed',async()=>{
 let destroyed=false,removed=0,closed=0;
 const parent=new EventEmitter();parent.isDestroyed=()=>destroyed;parent.contentView={addChildView(){},removeChildView(){if(destroyed)throw Error('Object has been destroyed');removed++;}};
 parent.getContentSize=()=>[1000,800];const parentContents=Object.assign(new EventEmitter(),{getZoomFactor:()=>1});Object.defineProperty(parent,'webContents',{get(){if(destroyed)throw Error('Object has been destroyed');return parentContents;}});
 class View{constructor(){this.webContents=Object.assign(new EventEmitter(),{isDestroyed:()=>closed>0,close(){closed++;this.emit('destroyed');},setWebRTCIPHandlingPolicy(){},setWindowOpenHandler(){},loadURL:async()=>{}});}setVisible(){}setBounds(){}}
 const connection=Object.assign(new EventEmitter(),{setPermissionRequestHandler(){},setPermissionCheckHandler(){},setSpellCheckerEnabled(){},webRequest:{onBeforeRequest(){}},protocol:{handle(){}},closeAllConnections:async()=>{}});
 const view=await openSandbox({WebContentsView:View,parent,session:{fromPartition:()=>connection},store:{read:()=>({manifest:{name:'Synthetic',apiVersion:1},html:'<html></html>'})},id:'synthetic',bounds:{x:0,y:90,width:500,height:500}});
 destroyed=true;assert.doesNotThrow(()=>parent.emit('closed'));assert.doesNotThrow(()=>view.close());assert.equal(removed,0);assert.equal(closed,1);
});
