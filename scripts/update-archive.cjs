// Use the .NET ZIP reader directly: PowerShell's optional Archive module can
// fail to load when a desktop host supplies a different PSModulePath.
function archiveExtractionCommand(archive,destination){
 const literal=value=>"'"+String(value).replaceAll("'","''")+"'";
 return "$ErrorActionPreference='Stop'; [void][System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [System.IO.Compression.ZipFile]::ExtractToDirectory("+literal(archive)+','+literal(destination)+')';
}
module.exports={archiveExtractionCommand};
