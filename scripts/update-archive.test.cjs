const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),p=require('node:path'),{execFileSync}=require('node:child_process');
const {archiveExtractionCommand}=require('./update-archive.cjs');
test('extracts reviewed source without PowerShell Archive modules, including quoted Unicode paths',{skip:process.platform!=='win32'},t=>{
 const home=fs.mkdtempSync(p.join(os.tmpdir(),"scoreler-解压'-"));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const input=p.join(home,'input'),output=p.join(home,'output'),zip=p.join(home,'source.zip');fs.mkdirSync(input);fs.writeFileSync(p.join(input,'package-lock.json'),'{}');
 const literal=value=>"'"+value.replaceAll("'","''")+"'";execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression'); [IO.Compression.ZipFile]::CreateFromDirectory("+literal(input)+','+literal(zip)+')'],{windowsHide:true});
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',archiveExtractionCommand(zip,output)],{windowsHide:true,env:{...process.env,PSModulePath:p.join(home,'missing-modules')}});assert.equal(fs.readFileSync(p.join(output,'package-lock.json'),'utf8'),'{}');
});

test('ZIP extraction rejects entries escaping the destination',{skip:process.platform!=='win32'},t=>{
 const home=fs.mkdtempSync(p.join(os.tmpdir(),'scoreler-zip-boundary-'));t.after(()=>fs.rmSync(home,{recursive:true,force:true}));const zip=p.join(home,'unsafe.zip'),output=p.join(home,'output');const literal=value=>"'"+value.replaceAll("'","''")+"'";
 execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression'); $z=[IO.Compression.ZipFile]::Open("+literal(zip)+",[IO.Compression.ZipArchiveMode]::Create); [void]$z.CreateEntry('../outside.txt'); $z.Dispose()"],{windowsHide:true});
 assert.throws(()=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',archiveExtractionCommand(zip,output)],{windowsHide:true,stdio:'pipe'}));assert(!fs.existsSync(p.join(home,'outside.txt')));
});
