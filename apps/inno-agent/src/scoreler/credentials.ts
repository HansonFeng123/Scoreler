import { spawnSync } from 'node:child_process';

const prefix = 'dpapi:v1:';
const cache = new Map<string,string>();
function dpapi(value: string, decrypt: boolean): string {
  if (process.platform !== 'win32') throw new Error('Secure credential persistence currently requires Windows. Use an empty key with a local model.');
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $s=[Console]::In.ReadToEnd(); $b=[Convert]::FromBase64String($s); $r=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  const child = spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:decrypt?value:Buffer.from(value,'utf8').toString('base64'),encoding:'utf8',windowsHide:true,timeout:15000});
  if (child.status !== 0 || child.error || !child.stdout.trim()) throw new Error('Windows credential encryption failed. Credentials were not saved.');
  return decrypt?Buffer.from(child.stdout.trim(),'base64').toString('utf8'):child.stdout.trim();
}
function transform(value: unknown, decrypt: boolean, secret=false): unknown {
  if (typeof value==='string' && secret && value) {
    if (decrypt) {
      if (!value.startsWith(prefix)) return value;
      let plain=cache.get(value);if(plain===undefined){plain=dpapi(value.slice(prefix.length),true);cache.set(value,plain);}return plain;
    }
    if(value.startsWith(prefix))return value;
    for(const [cipher,plain] of cache)if(plain===value)return cipher;
    const encrypted=prefix+dpapi(value,false);cache.set(encrypted,value);return encrypted;
  }
  if (Array.isArray(value)) return value.map(v=>transform(v,decrypt,secret));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,transform(v,decrypt,secret||/^(apiKey|token|appSecret|headers)$/i.test(k))]));
  return value;
}
export function protectConfig<T>(config:T): T { return transform(config,false) as T; }
export function unprotectConfig<T>(config:T): T { return transform(config,true) as T; }
