const api=window.companion,$=id=>document.getElementById(id);let state=null,dragStart=null,moved=false,images=[],readingImages=false,sending=false;
function paint(s){
 document.documentElement.dataset.edgeHidden=String(!!s.edgeHidden);
 $('dock').title=s.edgeAutoHide?(s.locale==='en'?'Keep pet visible':'取消贴边隐藏'):(s.locale==='en'?'Auto-hide at screen edge':'贴边自动隐藏');
 $('dock').setAttribute('aria-label',$('dock').title);$('dock').setAttribute('aria-pressed',String(!!s.edgeAutoHide));
 state=s;document.documentElement.dataset.palette=s.palette||'sage';document.documentElement.dataset.theme=s.theme==='dark'?'dark':'light';
 for(const key of ['--bg','--surface','--sidebar','--text','--muted','--line','--accent','--accent-light','--hover','--control','--on-accent','--pet-outline','--pet-body','--pet-shine','--pet-eyes','--pet-cheek']){const value=s.variables?.[key];if(typeof value==='string'&&/^#[a-f0-9]{6}([a-f0-9]{2})?$/i.test(value))document.documentElement.style.setProperty(key,value);else document.documentElement.style.removeProperty(key);}
 const en=s.locale==='en',summary=s.summary??{};
 $('pet').className=s.style+(s.expanded?' expanded':'');$('panel').hidden=!s.expanded;
 $('add-picture').title=en?'Add pictures':'添加图片';$('add-picture').setAttribute('aria-label',$('add-picture').title);$('askLabel').textContent=en?'Ask Scoreler':'问问 Scoreler';$('question').placeholder=en?'A question or a plan…':'问个问题，或安排学习……';
 $('hint').textContent=en?'Continue in Scoreler':'发送后在 Scoreler 中回答';for(const [id,label] of [['open',en?'Open Scoreler':'打开 Scoreler'],['collapse',en?'Collapse reminders':'收起提醒面板'],['hide',en?'Hide desktop companion':'隐藏桌面伙伴']]){$(id).title=label;$(id).setAttribute('aria-label',label);} $('collapse').hidden=!s.expanded;
 $('label').textContent=s.reminder?s.reminder.title:(en?'At a glance':'待办速览');$('reminder').hidden=!s.reminder;$('reminder').textContent=s.reminder?s.reminder.title+' · '+s.reminder.body:'';
 const format=item=>new Date(item.start).toLocaleString(en?'en':'zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+' · '+item.title;
 const highlights=summary.highlights??(summary.next?[summary.next]:[]);
 $('next').textContent=highlights[0]?format(highlights[0]):(en?'A little room to breathe':'暂无待办，轻松一下');$('next').title=$('next').textContent;
 $('second').textContent=highlights[1]?format(highlights[1]):(en?'Click to view your day':'点击查看今天的安排');$('second').title=$('second').textContent;if(s.reminder){$('second').textContent=$('next').textContent;$('next').textContent=s.reminder.body;$('next').title=s.reminder.body;}
 const agenda=$('agenda'),scroll=agenda.scrollTop;agenda.replaceChildren();
 for(const [key,label] of [['schedule',en?"Today’s schedule":'今日日程'],['homework',en?"Today’s homework":'今日作业'],['important',en?'Important & upcoming':'重要提醒与近期截止']]){
  const group=document.createElement('section'),heading=document.createElement('h3');heading.textContent=label;group.append(heading);
  const items=summary[key]??[];
  if(!items.length){const empty=document.createElement('p');empty.className='agenda-empty';empty.textContent=en?'Nothing pending':'暂无待办';group.append(empty);}
  for(const item of items){const row=document.createElement('div');row.className='agenda-row'+(item.overdue?' overdue':'');const title=document.createElement('span'),time=document.createElement('time');title.textContent=item.title;title.title=item.title;time.textContent=(item.overdue?(en?'Overdue · ':'已逾期 · '):'')+new Date(item.start).toLocaleString(en?'en':'zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});row.append(title,time);if(item.id){const finish=document.createElement('button');finish.className='task-finish';finish.textContent='✓';finish.title=en?'Mark finished':'标记完成';finish.setAttribute('aria-label',finish.title+': '+item.title);finish.onclick=async()=>{finish.disabled=true;try{paint(await api.complete(item.id));}catch(error){finish.disabled=false;const status=$('reminder');status.hidden=false;status.textContent=(en?'Could not finish task. Please retry.':'完成任务失败，请重试。');}};row.append(finish);}group.append(row);}
  agenda.append(group);
 }
 agenda.scrollTop=scroll;
}
api.onState(paint);api.get().then(paint);
$('dock').onclick=async()=>paint(await api.dock());
$('edge-tab').onpointerenter=()=>api.peek();$('edge-tab').onclick=()=>api.peek();
async function expand(){const was=state?.expanded;paint(await api.expand(!was));if(!was)$('question').focus();}
$('summary').onclick=expand;$('grip').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void expand();}};
$('grip').onpointerdown=e=>{if(e.button!==0)return;dragStart={x:e.screenX,y:e.screenY};moved=false;e.currentTarget.setPointerCapture(e.pointerId);api.drag('start');};
$('grip').onpointermove=e=>{if(!dragStart)return;if(Math.hypot(e.screenX-dragStart.x,e.screenY-dragStart.y)>4)moved=true;if(moved)api.drag('move');};
$('grip').onpointerup=()=>{if(!dragStart)return;dragStart=null;api.drag('end');};$('grip').onpointercancel=()=>{dragStart=null;moved=true;api.drag('end');};
$('grip').onclick=e=>{if(!moved){e.preventDefault();void expand();}};
$('open').onclick=()=>api.open();$('hide').onclick=()=>api.set({enabled:false});$('collapse').onclick=()=>api.expand(false);
$('ask').onsubmit=async e=>{e.preventDefault();const text=$('question').value.trim();if((!text&&!images.length)||readingImages||sending)return;sending=true;$('send').disabled=true;try{await api.ask({text,images:images.map(({mimeType,data})=>({mimeType,data}))});$('question').value='';images=[];drawImages();}catch(error){imageError(String(error));}finally{sending=false;$('send').disabled=false;}};
$('question').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('ask').requestSubmit();}};document.onkeydown=e=>{if(e.key==='Escape')api.expand(false);};

function imageError(text){$('attachment-error').hidden=!text;$('attachment-error').textContent=text;}
function drawImages(){const host=$('attachments');host.replaceChildren();images.forEach((image,index)=>{const box=document.createElement('div'),preview=document.createElement('img'),remove=document.createElement('button');preview.src='data:'+image.mimeType+';base64,'+image.data;preview.alt=image.name;remove.type='button';remove.textContent='×';remove.title=state?.locale==='en'?'Remove picture':'移除图片';remove.setAttribute('aria-label',remove.title);remove.onclick=()=>{images.splice(index,1);drawImages();};box.append(preview,remove);host.append(box);});}
async function addPictures(files){if(readingImages||sending)return;readingImages=true;$('send').disabled=true;imageError('');try{if(images.length+files.length>4)throw Error(state?.locale==='en'?'Up to 4 images per message.':'每条消息最多 4 张图片。');const added=[];for(const file of files){if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>5*1024*1024)throw Error(state?.locale==='en'?'Choose PNG, JPEG, WebP or GIF under 5 MB.':'请选择小于 5 MB 的 PNG、JPEG、WebP 或 GIF 图片。');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Unable to read picture'));reader.readAsDataURL(file);});added.push({name:file.name||'Screenshot',mimeType:file.type,data});}images.push(...added);drawImages();}catch(error){imageError(String(error));}finally{readingImages=false;$('send').disabled=false;$('picture-input').value='';}}
$('add-picture').onclick=()=>$('picture-input').click();$('picture-input').onchange=e=>void addPictures([...e.target.files]);$('question').onpaste=e=>{const files=[...e.clipboardData.items].filter(i=>i.kind==='file'&&i.type.startsWith('image/')).map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();void addPictures(files);}};

