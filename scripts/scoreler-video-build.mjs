import {bundle} from '@remotion/bundler';
import {resolve} from 'node:path';
await bundle({entryPoint:resolve('apps/inno-agent/video/src/index.tsx'),outDir:resolve('apps/inno-agent/video-dist'),publicDir:resolve('apps/inno-agent/video/public'),onProgress:p=>{if(p===100)console.log('Scoreler Remotion lesson bundle ready');}});
