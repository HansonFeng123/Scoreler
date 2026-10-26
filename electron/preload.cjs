const { contextBridge, ipcRenderer, webUtils } = require("electron");
let companionSubscriber=null;const companionPrompts=[];
ipcRenderer.on('scoreler-companion-prompt',(_event,text)=>{if(typeof text!=='string'&&(!text||typeof text.text!=='string'||!Array.isArray(text.images)))return;if(companionSubscriber)companionSubscriber(text);else companionPrompts.push(text);});

function isCloseDialogCopy(value) {
  if (!value || typeof value !== "object") return false;
  const copy = value;
  const buttons = copy.buttons;
  return typeof copy.title === "string"
    && typeof copy.message === "string"
    && typeof copy.detail === "string"
    && typeof copy.remember === "string"
    && buttons
    && typeof buttons === "object"
    && typeof buttons.hide === "string"
    && typeof buttons.quit === "string"
    && typeof buttons.cancel === "string";
}

function isWindowExpansionSide(value) {
  return value === "left" || value === "right";
}

contextBridge.exposeInMainWorld("innoDesktop", {
  setCloseDialogCopy(copy) {
    if (isCloseDialogCopy(copy)) {
      ipcRenderer.send("inno-close-dialog-copy", copy);
    }
  },
  async openLocalFile(file) {
    if (!file || typeof file !== "object") return false;
    let path = "";
    try {
      path = webUtils.getPathForFile(file) || "";
    } catch {
      path = "";
    }
    if (!path) return false;
    const error = await ipcRenderer.invoke("inno-open-path", path);
    return typeof error === "string" && error.length === 0;
  },
  expandWindowWidth(side, additionalWidth) {
    if (!isWindowExpansionSide(side) || !Number.isFinite(additionalWidth) || additionalWidth < 0) {
      return Promise.resolve(false);
    }
    return ipcRenderer.invoke("inno-expand-window-width", { side, additionalWidth });
  },
  getWindowWidthCapacity(side) {
    if (!isWindowExpansionSide(side)) return Promise.resolve(0);
    return ipcRenderer.invoke("inno-window-width-capacity", side);
  },
});

contextBridge.exposeInMainWorld("scorelerDesktop", {
 plugins:(action,value)=>{if(!['list','review','import','cancel','install','enable','uninstall','open'].includes(action))return Promise.reject(Error('Invalid plugin action'));return ipcRenderer.invoke('scoreler-plugins',action,value);},
 network:(action,value)=>{if(!['state','save','test'].includes(action))return Promise.reject(Error('Invalid network action'));return ipcRenderer.invoke('scoreler-network',action,value);},
 chatgpt:(action,value)=>{if(!['state','signin','cancel','disconnect','models','select','usage','begin-user-turn','end-user-turn','chat-prompts','background-prompts'].includes(action))return Promise.reject(Error('Invalid ChatGPT action'));return ipcRenderer.invoke('scoreler-chatgpt',action,value);},
 syncAppearance:value=>ipcRenderer.invoke('scoreler-appearance-set',value),
 syncTimer:value=>ipcRenderer.invoke('scoreler-timer-sync',value),
 onTimerExpired:fn=>{const listener=(_event,value)=>fn(value);ipcRenderer.on('scoreler-timer-expired',listener);return()=>ipcRenderer.removeListener('scoreler-timer-expired',listener);},
 updatePreferences:patch=>ipcRenderer.invoke('scoreler-update-preferences',patch),
 getAppInfo:()=>ipcRenderer.invoke('scoreler-app-info'),
 checkSourceUpdates:()=>ipcRenderer.invoke('scoreler-source-update-check'),
 applySourceUpdates:target=>ipcRenderer.invoke('scoreler-source-update-apply',target),
 onSetupOpen:fn=>{const listener=(_e,topic)=>fn(topic);ipcRenderer.on("scoreler-setup-open",listener);return()=>ipcRenderer.removeListener("scoreler-setup-open",listener);},
 mail:(action,value)=>{if(!['state','sync','connect','disconnect','read','search'].includes(action))return Promise.reject(Error('Invalid mail action'));return ipcRenderer.invoke('scoreler-mail-'+action,value);},
 onMailState:fn=>{const listener=(_e,value)=>fn(value);ipcRenderer.on('scoreler-mail-state',listener);return()=>ipcRenderer.removeListener('scoreler-mail-state',listener);},
 onMailArrived:fn=>{const listener=(_e,value)=>fn(value);ipcRenderer.on('scoreler-mail-arrived',listener);return()=>ipcRenderer.removeListener('scoreler-mail-arrived',listener);},
 onMailOpen:fn=>{const listener=()=>fn();ipcRenderer.on('scoreler-mail-open',listener);return()=>ipcRenderer.removeListener('scoreler-mail-open',listener);},
 browser:(action,value)=>ipcRenderer.invoke('scoreler-browser',action,value),
 onBrowserState:fn=>{const listener=(_e,value)=>fn(value);ipcRenderer.on('scoreler-browser-state',listener);return()=>ipcRenderer.removeListener('scoreler-browser-state',listener);}, getCompanion:()=>ipcRenderer.invoke('scoreler-companion-get'),setCompanion:patch=>ipcRenderer.invoke('scoreler-companion-set',patch),onCompanionPrompt:fn=>{companionSubscriber=fn;while(companionPrompts.length)fn(companionPrompts.shift());return()=>{if(companionSubscriber===fn)companionSubscriber=null;};},saveStudyExport:(paper)=>ipcRenderer.invoke("scoreler-save-study-export",paper), selectDrawingSavePath:(name)=>ipcRenderer.invoke("scoreler-select-drawing-save-path",name), copyDrawingImage:(data)=>ipcRenderer.invoke("scoreler-copy-drawing-image",data), savePracticePdf: (paper) => ipcRenderer.invoke("scoreler-save-practice-pdf",paper), selectStudyFolder: () => ipcRenderer.invoke("scoreler-select-study-folder"), openStudyItem: (item) => ipcRenderer.invoke("scoreler-open-study-item",item) });
