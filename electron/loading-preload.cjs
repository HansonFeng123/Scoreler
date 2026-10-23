const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('scorelerLoading',{appearance:ipcRenderer.sendSync('scoreler-loading-appearance')});
