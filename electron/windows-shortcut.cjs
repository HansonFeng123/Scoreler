const fs=require('node:fs'),path=require('node:path');
function repairWindowsShortcut({shell,appData,profile,executable,installed,root,icon}){
 const dir=path.join(appData,'Microsoft/Windows/Start Menu/Programs'),file=path.join(dir,'Scoreler.lnk');
 const updates=path.join(profile,'updates')+path.sep;
 const own=target=>target?.toLowerCase()===installed.toLowerCase()||target?.toLowerCase().startsWith(updates.toLowerCase());
 if(fs.existsSync(file)&&!own(shell.readShortcutLink(file).target))return false;
 const branded=path.basename(executable).toLowerCase()==='scoreler.exe';
 const target=branded?executable:fs.existsSync(installed)?installed:executable;
 const args=branded||target===installed?'':'"'+root+'" --scoreler-profile="'+profile+'"';
 fs.mkdirSync(dir,{recursive:true});
 shell.writeShortcutLink(file,fs.existsSync(file)?'update':'create',{target,args,cwd:path.dirname(target),description:'Scoreler',icon,iconIndex:0,appUserModelId:'com.scoreler.desktop'});
 const old=path.join(dir,'Electron.lnk');
 if(fs.existsSync(old)&&own(shell.readShortcutLink(old).target)){
  const backup=path.join(profile,'shortcut-backups');fs.mkdirSync(backup,{recursive:true});
  fs.copyFileSync(old,path.join(backup,'Electron-'+Date.now()+'.lnk'));fs.unlinkSync(old);
 }
 return true;
}
module.exports={repairWindowsShortcut};
