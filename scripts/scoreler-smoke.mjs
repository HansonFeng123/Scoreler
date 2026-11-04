import {DatabaseSync} from 'node:sqlite';
import JSZip from 'jszip';
import {createCanvas} from '@napi-rs/canvas';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {once} from 'node:events';
const home=mkdtempSync(join(tmpdir(),'scoreler-smoke-'));mkdirSync(join(home,'config'));
let calls=0;let workspaceFixtureId;let cleanupEventId,cleanupPlanId;const requests=[];
const fixture={title:'Smoke waves revision',subject:'physics',start:'2026-11-10T16:00:00+08:00',end:'2026-11-10T16:45:00+08:00',kind:'study',completed:false};
const model=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const b=JSON.parse(body);requests.push(b);calls++;
 const latestUser=b.messages?.findLast(m=>m.role==='user');
 const toolDone=b.messages?.slice(b.messages.indexOf(latestUser)+1).filter(m=>m.role==='tool')??[];
 const scenario=JSON.stringify(latestUser?.content??'');
 let tool=null,args={},reply='Study session ready.';
 const learningRequest=Boolean(b.tools?.length);
 if(learningRequest&&scenario.includes('SCENARIO_MEMORY')){
  if(toolDone.length<2){tool='student_memory_save';args=toolDone.length?{key:'semester_end',value:'2027-06-18'}:{key:'preferred_name',value:'Lin'};}else reply='Remembered your name and semester end date.';
 }else if(scenario.includes('SCENARIO_RECALL')){assert(JSON.stringify(b.messages.filter(m=>m.role==='system')).includes('2027-06-18'));assert(JSON.stringify(b.messages.filter(m=>m.role==='system')).includes('Lin'));reply='Lin, your semester ends on 2027-06-18.';
 }else if(learningRequest&&scenario.includes('SCENARIO_WORKSPACE')){
  if(!toolDone.length){tool='student_workspace_list';args={};}
  else if(toolDone.length===1){assert(JSON.stringify(toolDone).includes(workspaceFixtureId));tool='student_workspace_list';args={folderId:workspaceFixtureId,path:'Chemistry'};}
  else if(toolDone.length===2){assert(JSON.stringify(toolDone).includes('equilibrium.md'));tool='student_workspace_read';args={folderId:workspaceFixtureId,path:'Chemistry/equilibrium.md'};}
  else {assert(JSON.stringify(toolDone).includes('dynamic equilibrium'));reply='According to Subjects/Chemistry/equilibrium.md, chemical equilibrium is dynamic.';}
 }else if(learningRequest&&scenario.includes('SCENARIO_VIDEO')){
  if(!toolDone.length){tool='student_document_read';args={source:'waves.md'};}
  else if(toolDone.length===1){assert(JSON.stringify(toolDone).includes('Waves obey'));tool='student_video_generate';args={title:'Wave superposition',subject:'Physics',language:'en',sources:['waves.md'],scenes:[{title:'Add the displacements',bullets:['Find both displacements','Add them at the same point'],narration:'According to your notes, waves obey superposition. Add the displacements at the same point.',seconds:6,visual:'wave',formula:'2 mm + (−1 mm) = 1 mm',source:'waves.md'}]};}
  else {assert(JSON.stringify(toolDone).includes('queued'));reply='Your video is rendering in this chat.';} }else if(learningRequest&&scenario.includes('SCENARIO_SEARCH')){
  if(!toolDone.length){tool='student_search';args={query:'superposition'};}
  else {assert(JSON.stringify(toolDone).includes('Waves obey'));reply='According to waves.md (unpaginated text), waves obey superposition. 来源：waves.md。';}
 }else if(learningRequest&&scenario.includes('SCENARIO_EXAM')){
  if(!toolDone.length){tool='student_exam_save';args={title:'Original waves practice',subject:'physics',syllabus:'Student selected syllabus',session:'Student selected session',paper:'Topic quiz',minutes:15,instructions:'Answer both original questions.',questions:[{prompt:'Two waves have displacements of 2 mm and -1 mm at a point. Find their resultant displacement.',topic:'Superposition',marks:1,markingPoints:['Resultant displacement = 1 mm.']},{prompt:'Explain why a wave can transfer energy without a net transfer of matter.',topic:'Wave motion',marks:2,markingPoints:['Particles oscillate about equilibrium.','The disturbance and energy propagate.']}],sources:[]};}
  else reply='Saved an original general practice assessment, not an official IB paper.';
 }else if(learningRequest&&scenario.includes('SCENARIO_PLAN')){
  if(!toolDone.length)tool='student_overview';
  else if(toolDone.length===1){tool='student_calendar_batch';args={title:'Balanced revision week',events:[{...fixture,title:'Mechanics revision',start:'2026-11-11T16:00:00+08:00',end:'2026-11-11T16:40:00+08:00'},{...fixture,title:'Waves revision',start:'2026-11-12T16:00:00+08:00',end:'2026-11-12T16:40:00+08:00'}]};}
  else reply='Applied the complete schedule directly to your calendar.';
 }else if(learningRequest&&scenario.includes('SCENARIO_CLEANUP')){
  if(!toolDone.length){tool='student_overview';args={};}
  else if(toolDone.length===1){assert(JSON.stringify(toolDone).includes(cleanupPlanId));tool='student_calendar_delete';args={id:cleanupEventId};}
  else if(toolDone.length===2){tool='student_calendar_discard_plan';args={id:cleanupPlanId};}
  else reply='Removed the unwanted event and withdrew the old draft. Kept only the submission deadline.';
 }else if(learningRequest&&scenario.includes('SCENARIO_LONG_STUDY')){
  if(!toolDone.length){tool='student_calendar_create';args={...fixture,title:'12-hour study fixture',start:'2028-01-05T08:00:00+08:00',end:'2028-01-05T20:00:00+08:00'};}else reply='Scheduled the requested study duration without a daily cap.';
 }else if(learningRequest&&scenario.includes('SCENARIO_MULTI')){
  if(toolDone.length<2){tool='student_calendar_create';const day=toolDone.length+1;args={...fixture,title:`Multi event ${day}`,start:`2028-01-0${day}T16:00:00+08:00`,end:`2028-01-0${day}T16:45:00+08:00`};}else reply='Added both requested events in one turn.';
 }else if(learningRequest&&scenario.includes('Schedule one waves')){
  tool=toolDone.length===0?'student_overview':toolDone.length===1?'student_calendar_create':null;
  args=tool==='student_overview'?{}:fixture;reply='Scheduled your waves revision. 已安排波动复习。';
 }
 const delta=tool?{role:'assistant',tool_calls:[{index:0,id:`call_${calls}`,type:'function',function:{name:tool,arguments:JSON.stringify(args)}}]}:{role:'assistant',content:reply};
 res.writeHead(200,{'content-type':'text/event-stream'});
 res.write(`data: ${JSON.stringify({id:`chatcmpl-${calls}`,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'scoreler-smoke',choices:[{index:0,delta,finish_reason:null}]})}\n\n`);
 res.write(`data: ${JSON.stringify({id:`chatcmpl-${calls}`,object:'chat.completion.chunk',created:Math.floor(Date.now()/1000),model:'scoreler-smoke',choices:[{index:0,delta:{},finish_reason:tool?'tool_calls':'stop'}],usage:{prompt_tokens:50,completion_tokens:30,total_tokens:80}})}\n\n`);
 res.end('data: [DONE]\n\n');
});model.listen(0,'127.0.0.1');await once(model,'listening');const modelPort=model.address().port;
const config={defaultProvider:'smoke',defaultModel:'scoreler-smoke',providers:{smoke:{api:'openai-completions',baseUrl:`http://127.0.0.1:${modelPort}/v1`,apiKey:'',models:[{id:'scoreler-smoke',name:'Smoke fixture',input:['text'],contextWindow:32768,maxTokens:4096}]}},plugins:{computerUse:{enabled:false},codemode:{enabled:false},webAccess:{enabled:false}},subagents:{enabled:false},memory:{l1Enabled:false,l2Enabled:false,l3Enabled:false}};
writeFileSync(join(home,'config','config.json'),JSON.stringify(config));
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
let logs='';let child;
const base=`http://127.0.0.1:${port}`;
const api=async(path,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(90000)});const text=await r.text();assert(r.ok,`${method} ${path}: ${r.status} ${text}`);return JSON.parse(text);};
async function start(){
 child=spawn(process.env.SCORELER_TEST_EXECUTABLE||process.execPath,[process.env.SCORELER_TEST_SERVER||'apps/inno-agent/dist/server.js','--home',home,'--port',String(port)],{env:{...process.env,...(process.env.SCORELER_TEST_EXECUTABLE?{ELECTRON_RUN_AS_NODE:'1',NODE_PATH:''}:{}),SCORELER_DESKTOP_TOKEN:'scoreler-test-only',INNO_HOME:home,INNO_CONFIG_FILE:join(home,'config','config.json'),INNO_CONFIG_DIR:join(home,'config'),INNO_DATA_DIR:join(home,'data'),INNO_WORKSPACE_DIR:join(home,'generated')},stdio:['ignore','pipe','pipe'],windowsHide:true});
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 for(let i=0;i<100;i++){try{await api('/health');break;}catch{if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,200));}}
 }
try{
 await start();
 await api('/api/settings/providers','PUT',{providerId:'smoke',baseUrl:`http://127.0.0.1:${modelPort}/v1`,apiKey:'scoreler-fixture-key-not-real',api:'openai-completions',models:config.providers.smoke.models,makeDefault:true});
 const storedConfig=readFileSync(join(home,'config','config.json'),'utf8');assert(!storedConfig.includes('scoreler-fixture-key-not-real'));assert(storedConfig.includes('dpapi:v1:'));
 const session=await api('/api/sessions','POST',{});
 const response=await api('/api/chat','POST',{sessionId:session.id,prompt:'Schedule one waves revision session at 16:00 on November 10, 2026, lasting 45 minutes. Read the calendar first.'});
 assert.match(response.response,/Scheduled/);
 const state=await api('/api/student/state');assert.equal(state.events.length,1);assert.equal(state.events[0].title,fixture.title);
 assert(requests.length>=3,'Model must complete the tool loop');
 const tools=requests[0].tools?.map(t=>t.function.name)??[];assert(tools.includes('student_calendar_create'));assert(!tools.includes('bash'));assert(!tools.includes('read'));
 const detail=await api(`/api/sessions/${session.id}`);assert(detail.messages.some(m=>m.role==='assistant'&&m.content.includes('Scheduled')),'Conversation persisted');
 const uploaded=await api('/api/student/documents','POST',{name:'waves.md',data:Buffer.from('Waves obey the principle of superposition. 波的叠加原理。').toString('base64')});
 for(let i=0;i<50;i++){const s=await api('/api/student/state');if(s.documents.find(d=>d.id===uploaded.id)?.status==='ready')break;await new Promise(r=>setTimeout(r,100));}
 const evidence=await api('/api/student/search?q=superposition');assert(evidence.some(e=>e.source==='waves.md'));
 const word=new JSZip();word.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');word.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Refraction occurs when wave speed changes. 折射。</w:t></w:r></w:p></w:body></w:document>');
 const wordDoc=await api('/api/student/documents','POST',{name:'word-waves.docx',data:(await word.generateAsync({type:'nodebuffer'})).toString('base64')});
 const pdfStream='BT /F1 12 Tf 50 740 Td (Diffraction is wave spreading.) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${pdfStream.length} >>\nstream\n${pdfStream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(o=>`${String(o).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const pdfDoc=await api('/api/student/documents','POST',{name:'pdf-waves.pdf',data:Buffer.from(pdf).toString('base64')});
 for(let i=0;i<100;i++){const s=await api('/api/student/state');if([wordDoc.id,pdfDoc.id].every(id=>s.documents.find(d=>d.id===id)?.status==='ready'))break;await new Promise(r=>setTimeout(r,100));}
 assert((await api('/api/student/search?q=refraction')).some(e=>e.source==='word-waves.docx'&&e.page===0));assert((await api('/api/student/search?q=diffraction')).some(e=>e.source==='pdf-waves.pdf'&&e.page===1));
 const searchSession=await api('/api/sessions','POST',{});
 const searched=await api('/api/chat','POST',{sessionId:searchSession.id,prompt:'SCENARIO_SEARCH: explain superposition using my imported notes and cite them.'});assert.match(searched.response,/waves.md/);
 if(process.env.SCORELER_TEST_VIDEO){
 const videoSession=await api('/api/sessions','POST',{});const videoReply=await api('/api/chat','POST',{sessionId:videoSession.id,prompt:'SCENARIO_VIDEO: make a teaching video based on waves.md.'});assert.match(videoReply.response,/rendering/);
 let video;for(let i=0;i<300;i++){video=(await api('/api/student/videos')).find(v=>v.sessionId===videoSession.id);if(video?.status==='ready'||video?.status==='failed')break;await new Promise(r=>setTimeout(r,1000));}assert.equal(video?.status,'ready',video?.error);assert.equal(video.audio,true);
 const media=await fetch(base+video.url,{headers:{Range:'bytes=0-63'}});assert.equal(media.status,206);assert.equal((await media.arrayBuffer()).byteLength,64);assert.match(media.headers.get('content-range'),/^bytes 0-63\//);assert.equal((await fetch(base+video.url,{headers:{Range:'bytes=999999999999-'}})).status,416);assert.equal((await fetch(base+`/api/student/videos/${video.id}/poster`)).status,200);assert.equal((await api(`/api/student/videos/${video.id}/lesson`)).sources[0],'waves.md');console.log('Verified teaching-video agent tool, file reference, narration, range playback and download.');
 } const examSession=await api('/api/sessions','POST',{});
 const assessment=await api('/api/chat','POST',{sessionId:examSession.id,prompt:'SCENARIO_EXAM: generate an original Physics waves topic quiz, labelled general practice.'});assert.match(assessment.response,/general practice/);
 const exams=(await api('/api/student/state')).exams;assert.equal(exams.length,1);assert.equal(exams[0].format,'general-practice');assert.equal(exams[0].questions.length,2);
 const freshAttempt=await api(`/api/student/attempts/${exams[0].id}`);assert.deepEqual(freshAttempt.answers,['','']);assert.equal(freshAttempt.submitted,false);
 await api(`/api/student/attempts/${exams[0].id}`,'PUT',{answers:['1 mm','Particles oscillate; the disturbance travels.'],submitted:true});assert.equal((await api(`/api/student/attempts/${exams[0].id}`)).submitted,true);
 const planSession=await api('/api/sessions','POST',{});
 const stream=await fetch(base+'/api/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:planSession.id,clientRequestId:crypto.randomUUID(),prompt:'SCENARIO_PLAN: propose two revision sessions next week.'}),signal:AbortSignal.timeout(90000)});assert(stream.ok);const streamText=await stream.text();assert.match(streamText,/text_delta/);assert.match(streamText,/student_calendar_batch/);
 const applied=await api('/api/student/state');assert.equal(applied.events.length,3,'Bulk schedule applies without approval');assert.equal(applied.plans.length,0);await api('/api/student/undo','POST');assert.equal((await api('/api/student/state')).events.length,1,'One undo removes the whole batch');await api('/api/chat','POST',{sessionId:planSession.id,prompt:'SCENARIO_PLAN: add those two sessions again.'});assert.equal((await api('/api/student/state')).events.length,3);

 const denied=await fetch(base+'/api/student/events',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(fixture)});assert.equal(denied.status,403);
 const memorySession=await api('/api/sessions','POST',{});await api('/api/chat','POST',{sessionId:memorySession.id,prompt:'SCENARIO_MEMORY: My name is Lin. My semester ends 2027-06-18. Remember these facts.'});assert.equal((await api('/api/student/memory')).length,2);assert(readFileSync(join(home,'data','knowledge','STUDENT.md'),'utf8').includes('Lin'));
 const exited=once(child,'exit');child.kill();await exited;child=null;
 await start();
 const recallSession=await api('/api/sessions','POST',{});const recall=await api('/api/chat','POST',{sessionId:recallSession.id,prompt:'SCENARIO_RECALL: What is my name and when does my semester end?'});assert.match(recall.response,/Lin.*2027-06-18/);
 const restored=await api('/api/student/state');assert.equal(restored.events.length,3);assert.equal(restored.exams.length,1);assert.equal((await api(`/api/student/attempts/${exams[0].id}`)).submitted,true);assert((await api(`/api/sessions/${session.id}`)).messages.some(m=>m.content.includes('Scheduled')));
 const afterRestart=await api('/api/chat','POST',{sessionId:searchSession.id,prompt:'SCENARIO_SEARCH: explain superposition using my notes after restart.'});assert.match(afterRestart.response,/waves.md/);
 await api('/api/settings/providers','PUT',{providerId:'smoke',baseUrl:`http://127.0.0.1:${modelPort}/v1`,apiKey:'',preserveApiKey:true,api:'openai-completions',models:config.providers.smoke.models.map(m=>({...m,supportsTools:false})),makeDefault:true});
 const plainSession=await api('/api/sessions','POST',{});const beforePlain=requests.length;
 await api('/api/chat','POST',{sessionId:plainSession.id,prompt:'Explain a concept using plain chat without tools.'});assert(requests.slice(beforePlain).every(r=>!r.tools?.length));
 await api('/api/settings/providers','PUT',{providerId:'smoke',baseUrl:`http://127.0.0.1:${modelPort}/v1`,apiKey:'',preserveApiKey:true,api:'openai-completions',models:config.providers.smoke.models.map(m=>({...m,input:['text','image']})),makeDefault:true});
 const imageSession=await api('/api/sessions','POST',{});const beforeImage=requests.length;
 // Generate a decodable synthetic PNG rather than depending on screenshots
 // from a developer profile or of files omitted from the public source.
 const imageCanvas=createCanvas(100,100);imageCanvas.getContext('2d').fillRect(0,0,100,100);
 const pixel=imageCanvas.toBuffer('image/png').toString('base64');
 await api('/api/chat','POST',{sessionId:imageSession.id,prompt:'Describe this screenshot.',images:[{data:pixel,mimeType:'image/png'}]});
 writeFileSync(join(home,'image-requests.json'),JSON.stringify(requests.slice(beforeImage),null,2));
 assert(requests.slice(beforeImage).some(r=>r.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c.type==='image_url'))),'Image must reach the vision model');
 const imageHistory=await api(`/api/sessions/${imageSession.id}`);assert(imageHistory.messages.some(m=>m.images?.length),'Screenshot must survive history reload');
 const multiSession=await api('/api/sessions','POST',{});const eventCount=(await api('/api/student/state')).events.length;
 await api('/api/chat','POST',{sessionId:multiSession.id,prompt:'SCENARIO_MULTI: add these two explicitly requested events in one turn.'});
 assert.equal((await api('/api/student/state')).events.length,eventCount+2,'Multiple calendar edits in one turn must succeed');
 const subjectsRoot=join(home,'Subjects');mkdirSync(join(subjectsRoot,'Chemistry'),{recursive:true});mkdirSync(join(subjectsRoot,'Physics'));writeFileSync(join(subjectsRoot,'Chemistry','equilibrium.md'),'Chemical equilibrium is dynamic equilibrium. 化学平衡是动态平衡。');
 const authorized=await fetch(base+'/api/student/folders/authorize',{method:'POST',headers:{'Content-Type':'application/json','x-scoreler-desktop-token':'scoreler-test-only'},body:JSON.stringify({path:subjectsRoot})});assert(authorized.ok);workspaceFixtureId=(await authorized.json()).id;
 const browseSession=await api('/api/sessions','POST',{});const browse=await api('/api/chat','POST',{sessionId:browseSession.id,prompt:'SCENARIO_WORKSPACE: Find my chemistry equilibrium notes and explain what they say.'});assert.match(browse.response,/Chemistry\/equilibrium.md/);
 await api('/api/student/workspace/upload','POST',{folderId:workspaceFixtureId,path:'Physics',name:'waves.txt',data:Buffer.from('Waves superpose.').toString('base64')});assert.equal(readFileSync(join(subjectsRoot,'Physics','waves.txt'),'utf8'),'Waves superpose.');
 const imageMistake=await api('/api/student/mistakes','POST',{subject:'physics',topic:'Screenshot question',question:'',images:[{field:'question',mimeType:'image/png',data:pixel}]});assert.equal((await api('/api/student/state')).mistakes.find(m=>m.id===imageMistake.id).images.length,1);const savedScreenshot=(await api('/api/student/state')).mistakes.find(m=>m.id===imageMistake.id).images[0];assert(!savedScreenshot.data);const screenshotResponse=await fetch(base+savedScreenshot.url);assert(screenshotResponse.ok);assert.equal(Buffer.from(await screenshotResponse.arrayBuffer()).toString('base64'),pixel);
 const unlimited=await api('/api/student/preferences','PUT',{dailyMinutes:15,responseLanguage:'auto',reminders:true});assert(!('dailyMinutes' in unlimited));const beforeLong=(await api('/api/student/state')).events.length;const longSession=await api('/api/sessions','POST',{});await api('/api/chat','POST',{sessionId:longSession.id,prompt:'SCENARIO_LONG_STUDY: Schedule the explicitly requested 12-hour study event.'});assert.equal((await api('/api/student/state')).events.length,beforeLong+1,'No daily study-time cap may block the requested duration');
 const keep=await api('/api/student/events','POST',{...fixture,title:'Keep submission deadline',kind:'assignment'});const unwanted=await api('/api/student/events','POST',{...fixture,title:'Remove accidental writing block',kind:'assignment'});cleanupEventId=unwanted.id;cleanupPlanId=crypto.randomUUID();const fixtureDb=new DatabaseSync(join(home,'data','scoreler.sqlite'));fixtureDb.prepare('INSERT INTO records VALUES (?,?,?)').run('plans',cleanupPlanId,JSON.stringify({id:cleanupPlanId,title:'Unwanted old writing draft',events:[fixture]}));fixtureDb.close();const cleanupSession=await api('/api/sessions','POST',{});const cleaned=await api('/api/chat','POST',{sessionId:cleanupSession.id,prompt:'SCENARIO_CLEANUP: keep only my submission deadline; delete the unwanted writing event and withdraw the old draft.'});assert.match(cleaned.response,/withdrew/);const cleanState=await api('/api/student/state');assert(cleanState.events.some(e=>e.id===keep.id));assert(!cleanState.events.some(e=>e.id===cleanupEventId));assert(!cleanState.plans.some(p=>p.id===cleanupPlanId));assert(!('subjects' in cleanState));
 console.log(JSON.stringify({ok:true,modelCalls:requests.length,activeTools:tools,sessionPersisted:true,calendarToolExecuted:true,documentSearch:true,pdfAndDocxImport:true,citedQA:true,originalAssessment:true,persistedAnswers:true,streamingDirectBatch:true,crossOriginDenied:true,credentialsEncrypted:true,persistenceAcrossRestart:true,toolLessModelFallback:true,screenshotInput:true,multipleCalendarEdits:true,noCalendarApproval:true,calendarDeletionAndDraftWithdrawal:true,removedSubjectRegistry:true,memoryAcrossNewChatsAndRestart:true,workspaceNavigation:true,workspaceUpload:true,mistakeScreenshots:true,dailyCapRemoved:true,home},null,2));
}catch(error){console.error(error);writeFileSync(join(home,'smoke-error.log'),logs);console.error('Runtime log:',join(home,'smoke-error.log'));process.exitCode=1;}
finally{child?.kill();model.close();}
