import {it,expect} from 'vitest';
import {isWindowsProfileMirror} from './profile-path.js';
it('recognizes only the exact packaged Roaming mirror of a logical profile file',()=>{
 const roaming='C:\\Users\\Student\\AppData\\Roaming',local='C:\\Users\\Student\\AppData\\Local',file=roaming+'\\scoreler-desktop\\study\\data\\notes\\Physics\\Waves.scoreler-drawing',mirror=local+'\\Packages\\Example.App_123\\LocalCache\\Roaming\\scoreler-desktop\\study\\data\\notes\\Physics\\Waves.scoreler-drawing';
 expect(isWindowsProfileMirror(file,mirror,roaming,local)).toBe(true);
 for(const wrong of [mirror.replace('Waves','Other'),mirror.replace('scoreler-desktop','other-profile'),mirror.replace('LocalCache','LocalState'),'C:\\outside\\Waves.scoreler-drawing'])expect(isWindowsProfileMirror(file,wrong,roaming,local)).toBe(false);
 expect(isWindowsProfileMirror('C:\\outside\\Waves.scoreler-drawing',mirror,roaming,local)).toBe(false);
});
