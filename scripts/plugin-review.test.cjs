const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createPlugins}=require('../electron/plugins.cjs');
const {zipFiles}=require('./build-plugin-zip.cjs');

test('installation can be retried after an error without another download',async t=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'scoreler-plugin-review-'));
 t.after(()=>fs.rmSync(home,{recursive:true,force:true}));
 const root=path.resolve(__dirname,'..'),files={};
 for(const name of ['manifest.json','index.html','LICENSE','README.md'])files[name]=fs.readFileSync(path.join(root,'examples/unit-converter',name));
 const zip=path.join(home,'test.zip');fs.writeFileSync(zip,zipFiles(files));
 const host=createPlugins({app:{getPath:()=>home,getAppPath:()=>root},getWindow:()=>null,dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[zip]}),showMessageBox:async()=>({response:1})}});
 const review=await host.action('import'),install=host.store.install.bind(host.store);let attempts=0;
 host.store.install=async(...args)=>{if(!attempts++)throw Error('Temporary installation error');return install(...args);};
 await assert.rejects(host.action('install',{token:review.token}),/Temporary installation error/);
 assert.equal((await host.action('list')).installed.length,0);
 assert.equal((await host.action('install',{token:review.token})).installed[0].manifest.id,review.manifest.id);
});
