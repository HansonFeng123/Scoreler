param([Parameter(Mandatory=$true)][string]$Executable,[Parameter(Mandatory=$true)][string]$Icon)
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class ScorelerBrand {
 delegate bool EnumNames(IntPtr m,IntPtr t,IntPtr n,IntPtr p);
 delegate bool EnumLang(IntPtr m,IntPtr t,IntPtr n,ushort l,IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string p,IntPtr f,uint flags);
 [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr m);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindResource(IntPtr m,IntPtr n,IntPtr t);
 [DllImport("kernel32.dll")] static extern uint SizeofResource(IntPtr m,IntPtr r);
 [DllImport("kernel32.dll")] static extern IntPtr LoadResource(IntPtr m,IntPtr r);
 [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr r);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceNames(IntPtr m,IntPtr t,EnumNames cb,IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceLanguages(IntPtr m,IntPtr t,IntPtr n,EnumLang cb,IntPtr p);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResource(string p,bool delete);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool UpdateResource(IntPtr h,IntPtr t,IntPtr n,ushort l,byte[] data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool EndUpdateResource(IntPtr h,bool discard);
 public static void Apply(string exe,string icon) {
  byte[] bytes=File.ReadAllBytes(icon);int count=BitConverter.ToUInt16(bytes,4);
  if(bytes.Length<22||BitConverter.ToUInt16(bytes,2)!=1||count<1||count>64)throw new Exception("Invalid mascot ICO");
  var names=new List<Tuple<string,int,ushort>>();IntPtr module=LoadLibraryEx(exe,IntPtr.Zero,2);
  if(module==IntPtr.Zero)throw new Exception("Cannot inspect runtime resources");
  EnumNames cb=(m,t,n,p)=>{string text=(n.ToInt64()>>16)==0?null:Marshal.PtrToStringUni(n);int id=text==null?n.ToInt32():0;EnumLang langs=(mm,tt,nn,l,pp)=>{names.Add(Tuple.Create(text,id,l));return true;};EnumResourceLanguages(m,t,n,langs,IntPtr.Zero);return true;};
  EnumResourceNames(module,new IntPtr(14),cb,IntPtr.Zero);
  var languages=new List<ushort>();byte[] version=null;IntPtr resource=FindResource(module,new IntPtr(1),new IntPtr(16));
  if(resource!=IntPtr.Zero){version=new byte[SizeofResource(module,resource)];Marshal.Copy(LockResource(LoadResource(module,resource)),version,0,version.Length);EnumLang vl=(m,t,n,l,p)=>{languages.Add(l);return true;};EnumResourceLanguages(module,new IntPtr(16),new IntPtr(1),vl,IntPtr.Zero);}
  FreeLibrary(module);
  if(version==null)throw new Exception("Runtime version metadata is missing");
  foreach(string key in new[]{"ProductName","FileDescription","InternalName","OriginalFilename"}){
   byte[] pattern=Encoding.Unicode.GetBytes(key+"\0");
   for(int at=6;at+pattern.Length<version.Length;at+=2){bool match=true;for(int j=0;j<pattern.Length;j++)if(version[at+j]!=pattern[j]){match=false;break;}if(!match)continue;
    int size=BitConverter.ToUInt16(version,at-4)*2,start=(at+pattern.Length+3)&~3;string replacement=key=="OriginalFilename"?"Scoreler.exe":"Scoreler";byte[] text=Encoding.Unicode.GetBytes(replacement+"\0");
    if(size<text.Length||start+size>version.Length)throw new Exception("Unexpected runtime version field");Array.Clear(version,start,size);Array.Copy(text,0,version,start,text.Length);Array.Copy(BitConverter.GetBytes((ushort)(text.Length/2)),0,version,at-4,2);break;
   }
  }
  IntPtr handle=BeginUpdateResource(exe,false);if(handle==IntPtr.Zero)throw new Exception("Cannot update private runtime copy");
  try {
   foreach(var entry in names){IntPtr name=entry.Item1==null?new IntPtr(entry.Item2):Marshal.StringToHGlobalUni(entry.Item1);try{if(!UpdateResource(handle,new IntPtr(14),name,entry.Item3,null,0))throw new Exception("Cannot replace runtime icon group");}finally{if(entry.Item1!=null)Marshal.FreeHGlobal(name);}}
   byte[] group=new byte[6+14*count];Array.Copy(bytes,0,group,0,6);
   for(int i=0;i<count;i++){int offset=6+16*i;uint size=BitConverter.ToUInt32(bytes,offset+8),start=BitConverter.ToUInt32(bytes,offset+12);if((long)start+size>bytes.Length)throw new Exception("Invalid mascot image bounds");byte[] data=new byte[size];Array.Copy(bytes,start,data,0,size);int id=500+i;if(!UpdateResource(handle,new IntPtr(3),new IntPtr(id),0,data,size))throw new Exception("Cannot write mascot image");Array.Copy(bytes,offset,group,6+14*i,12);Array.Copy(BitConverter.GetBytes((ushort)id),0,group,6+14*i+12,2);}
   if(!UpdateResource(handle,new IntPtr(14),new IntPtr(1),0,group,(uint)group.Length))throw new Exception("Cannot write mascot group");
   foreach(ushort language in languages)if(!UpdateResource(handle,new IntPtr(16),new IntPtr(1),language,version,(uint)version.Length))throw new Exception("Cannot write Scoreler identity");
   if(!EndUpdateResource(handle,false))throw new Exception("Cannot finish runtime branding");handle=IntPtr.Zero;
  } finally {if(handle!=IntPtr.Zero)EndUpdateResource(handle,true);}
 }
}
'@
[ScorelerBrand]::Apply($Executable,$Icon)
if([Diagnostics.FileVersionInfo]::GetVersionInfo($Executable).ProductName -ne 'Scoreler'){throw 'Scoreler executable identity verification failed'}
