import {bundle} from '@remotion/bundler';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync} from 'node:fs';
await bundle({entryPoint:resolve('apps/inno-agent/video/src/index.tsx'),outDir:resolve('apps/inno-agent/video-dist'),publicDir:resolve('apps/inno-agent/video/public'),onProgress:p=>{if(p===100)console.log('Scoreler Remotion lesson bundle ready');}});
// Remotion embeds the build machine's working directory for development.
// Remove it from distributable output; lesson assets use relative URLs.
const html=resolve('apps/inno-agent/video-dist/index.html');
writeFileSync(html,readFileSync(html,'utf8').replace(/window\.remotion_cwd\s*=\s*"(?:\\.|[^"\\])*"\s*;/g,'window.remotion_cwd = "";'));
