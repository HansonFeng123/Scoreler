const fs=require('node:fs'),path=require('node:path');
function publishShortcut({shell,file,profile,value}){
 if(fs.existsSync(file)){const current=shell.readShortcutLink(file);if(Object.keys(value).every(key=>(current[key]??(key==='iconIndex'?0:''))===value[key]))return false;}
 const dir=path.join(profile,'shortcut-staging');fs.mkdirSync(dir,{recursive:true});
 const temporary=path.join(dir,require('node:crypto').randomUUID()+'.lnk');
 try{if(shell.writeShortcutLink(temporary,'create',value)===false)throw Error('Could not create Scoreler shortcut');fs.renameSync(temporary,file);}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return true;
}
function repairWindowsShortcut({shell,appData,profile,executable,installed,root,icon}){
 const dir=path.join(appData,'Microsoft/Windows/Start Menu/Programs'),file=path.join(dir,'Scoreler.lnk');
 const updates=path.join(profile,'updates')+path.sep;
 const own=target=>target?.toLowerCase()===installed.toLowerCase()||target?.toLowerCase().startsWith(updates.toLowerCase())||target?.toLowerCase()===path.join(root,'node_modules/electron/dist/electron.exe').toLowerCase();
 if(fs.existsSync(file)&&!own(shell.readShortcutLink(file).target))return false;
 const branded=path.basename(executable).toLowerCase()==='scoreler.exe';
 const target=branded?executable:fs.existsSync(installed)?installed:executable;
 const args=branded||target===installed?'':'"'+root+'" --scoreler-profile="'+profile+'"';
 fs.mkdirSync(dir,{recursive:true});
 publishShortcut({shell,file,profile,value:{target,args,cwd:path.dirname(target),description:'Scoreler',icon,iconIndex:0,appUserModelId:'com.scoreler.desktop'}});
 const old=path.join(dir,'Electron.lnk');
 if(fs.existsSync(old)&&own(shell.readShortcutLink(old).target)){
  const backup=path.join(profile,'shortcut-backups');fs.mkdirSync(backup,{recursive:true});
  fs.copyFileSync(old,path.join(backup,'Electron-'+Date.now()+'.lnk'));fs.unlinkSync(old);
 }
 return true;
}
function repairPreviewShortcut({shell,appData,profile,executable,root,icon}){
 const dir=path.join(appData,'Microsoft/Windows/Start Menu/Programs'),file=path.join(dir,'Scoreler Preview.lnk');
 const privateRoot=path.join(root,'runtime')+path.sep;
 const owned=target=>typeof target==='string'&&(target.toLowerCase()===executable.toLowerCase()||target.toLowerCase().startsWith(privateRoot.toLowerCase()));
 if(fs.existsSync(file)&&!owned(shell.readShortcutLink(file).target))return false;
 fs.mkdirSync(dir,{recursive:true});
 publishShortcut({shell,file,profile,value:{target:executable,args:'"'+root+'" --scoreler-profile="'+profile+'"',cwd:root,description:'Scoreler local preview',icon,iconIndex:0,appUserModelId:'com.scoreler.desktop.preview'}});
 const old=path.join(dir,'Electron.lnk'),legacy=path.join(root,'node_modules/electron/dist/electron.exe');
 if(fs.existsSync(old)&&shell.readShortcutLink(old).target?.toLowerCase()===legacy.toLowerCase()){
  const backup=path.join(profile,'shortcut-backups');fs.mkdirSync(backup,{recursive:true});
  fs.renameSync(old,path.join(backup,'Electron-'+Date.now()+'.lnk'));
 }
 return true;
}
module.exports={repairWindowsShortcut,repairPreviewShortcut};
