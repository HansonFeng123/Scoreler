const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('companion',{
 get:()=>ipcRenderer.invoke('scoreler-companion-get'),
 set:patch=>ipcRenderer.invoke('scoreler-companion-set',patch),
 expand:expanded=>ipcRenderer.invoke('scoreler-companion-expand',!!expanded),
 dock:()=>ipcRenderer.invoke('scoreler-companion-dock'),
 peek:()=>ipcRenderer.invoke('scoreler-companion-peek'),
 drag:phase=>ipcRenderer.send('scoreler-companion-drag',phase),
 open:()=>ipcRenderer.invoke('scoreler-companion-open'),
 complete:id=>ipcRenderer.invoke('scoreler-companion-complete',id),
 ask:text=>ipcRenderer.invoke('scoreler-companion-ask',text),
 onState:fn=>{const listener=(_e,state)=>fn(state);ipcRenderer.on('scoreler-companion-state',listener);return()=>ipcRenderer.removeListener('scoreler-companion-state',listener);},
});
