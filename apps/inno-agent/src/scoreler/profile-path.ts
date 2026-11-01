import {win32 as path} from 'node:path';
// Packaged Windows hosts can redirect individual Roaming files while their
// parent directory still resolves to the ordinary profile. Accept only an
// exact logical-file mirror, never an arbitrary path in another package.
export function isWindowsProfileMirror(logical:string,physical:string,appData:string,localAppData:string){
 if(!appData||!localAppData)return false;
 const relative=path.relative(appData,logical);
 if(!relative||relative==='..'||relative.startsWith('..\\')||path.isAbsolute(relative))return false;
 const packages=path.join(localAppData,'Packages'),tail=path.relative(packages,physical),parts=tail.split('\\');
 if(path.isAbsolute(tail)||parts[0]==='..'||!parts[0]||parts[1]?.toLowerCase()!=='localcache'||parts[2]?.toLowerCase()!=='roaming')return false;
 const expected=path.join(packages,parts[0],'LocalCache','Roaming',relative);
 return path.normalize(expected).toLowerCase()===path.normalize(physical).toLowerCase();
}
