import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StudyEvent {
  id: string; title: string; subject: string; start: string; end: string;
  kind: 'study' | 'lesson' | 'assignment' | 'exam'; completed: boolean;
}
export interface MistakeImage { field:'question'|'answer'|'correction'; mimeType:string; data?:string; id?:string; url?:string }
export interface Mistake {
  id: string; subject: string; topic: string; question: string; answer: string;
  correction: string; resolved: boolean; createdAt: string; images?:MistakeImage[];
}
export interface PracticeQuestion { prompt: string; topic: string; marks: number; markingPoints: string[] }
export interface PracticeTest {
  id: string; title: string; subject: string; syllabus: string; session: string; paper: string;
  minutes: number; instructions: string; questions: PracticeQuestion[];
  sources: Array<{ url: string; title: string; checkedAt?: string }>;
  format: 'general-practice'; createdAt: string;
}
export interface StudentPreferences { responseLanguage: 'en' | 'zh-CN' | 'auto'; reminders: boolean; grade?: '' | 'G10-PreIB' | 'G11-IBDP' | 'G12-IBDP' }

export class StudentError extends Error {}
function text(value: unknown, name: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new StudentError(`Invalid ${name}`);
  return value.trim();
}
export function validateEvent(raw: unknown): Omit<StudyEvent, 'id'> {
  if (!raw || typeof raw !== 'object') throw new StudentError('Invalid event');
  const v = raw as Record<string, unknown>;
  const title = text(v.title, 'title', 200);
  const start = text(v.start, 'start', 50), end = text(v.end, 'end', 50);
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) throw new StudentError('End must be after start');
  if (Date.parse(end) - Date.parse(start) > 24 * 60 * 60 * 1000) throw new StudentError('Events must be shorter than a day');
  if (!['study', 'lesson', 'assignment', 'exam'].includes(String(v.kind))) throw new StudentError('Invalid event kind');
  if (v.completed !== undefined && typeof v.completed !== 'boolean') throw new StudentError('Invalid completion');
  return { title, subject: typeof v.subject === 'string' ? v.subject.slice(0, 100) : '', start: new Date(start).toISOString(), end: new Date(end).toISOString(), kind: v.kind as StudyEvent['kind'], completed: v.completed === true };
}

export class StudentStore {
  private db: DatabaseSync;
  constructor(private directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'scoreler.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));
      CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, entity TEXT NOT NULL, before_data TEXT, after_data TEXT, undone INTEGER NOT NULL DEFAULT 0);
      CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks USING fts5(document_id UNINDEXED, source UNINDEXED, page UNINDEXED, content, tokenize='unicode61');
      CREATE INDEX IF NOT EXISTS document_paths ON records(collection,json_extract(data,'$.folderId'),json_extract(data,'$.relativePath'));
      CREATE INDEX IF NOT EXISTS document_sources ON records(collection,json_extract(data,'$.source'));
      PRAGMA user_version=1;`);
    if(!this.get('meta','subject-registry-removed')){
      this.db.exec('BEGIN');try{const subjects=this.list<{id:string;name:string}>('subjects');const labels=new Map(subjects.map(s=>[s.id,s.id==='math-aa'?'Mathematics':s.id==='physics'?'Physics':s.name]));for(const collection of ['events','mistakes','exams'])for(const record of this.list<{id:string;subject?:string}>(collection))if(record.subject&&labels.has(record.subject))this.put(collection,{...record,subject:labels.get(record.subject)});this.db.prepare("DELETE FROM records WHERE collection='subjects'").run();this.put('meta',{id:'subject-registry-removed'});this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
    }
  }
  close() { this.db.close(); }
  transaction<T>(run:()=>T):T {this.db.exec("BEGIN");try{const result=run();this.db.exec("COMMIT");return result;}catch(error){this.db.exec("ROLLBACK");throw error;}}
  proposePlan(title: string, rawEvents: unknown[], sessionId?: string) {
    if (!Array.isArray(rawEvents) || !rawEvents.length) throw new StudentError('A plan needs at least one session');
    return this.put('plans', { id: randomUUID(), title: text(title,'title',200), events: rawEvents.map(validateEvent), ...(sessionId?{sessionId}:{}), createdAt: new Date().toISOString() });
  }
  applyPlan(id: string) {
    const plan = this.get<{id:string;title:string; events:Omit<StudyEvent,'id'>[]}>('plans',id);
    if (!plan) throw new StudentError('Plan not found');
    return this.commitPlan(plan.title,plan.events,id);
  }
  savePlan(title:string,rawEvents:unknown[]){return this.commitPlan(title,rawEvents);}
  private commitPlan(title:string,rawEvents:unknown[],planId?:string){
    text(title,'title',200);if(!Array.isArray(rawEvents)||!rawEvents.length)throw new StudentError('A plan needs at least one session');
    const requested=rawEvents.map(validateEvent);
    this.db.exec('BEGIN');
    try {
      const last=Number(this.db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM activity').get()!.id);
      const fingerprint=(e:Omit<StudyEvent,'id'>)=>JSON.stringify([e.title,e.subject,e.start,e.end,e.kind]);
      const existing=new Set(this.list<StudyEvent>('events').map(fingerprint));
      const events:StudyEvent[]=[];for(const e of requested){const key=fingerprint(e);if(existing.has(key))continue;events.push(this.saveEvent(e,undefined,true));existing.add(key);}
      this.db.prepare('DELETE FROM activity WHERE id>?').run(last);
      if(events.length)this.log('batch-create',randomUUID(),undefined,events);
      if(planId)this.remove('plans',planId);this.db.exec('COMMIT');return events;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  list<T>(collection: string): T[] {
    return this.db.prepare('SELECT data FROM records WHERE collection=? ORDER BY rowid').all(collection).map(r => JSON.parse(String(r.data)) as T);
  }
  get<T>(collection: string, id: string): T | undefined {
    const row = this.db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get(collection, id);
    return row ? JSON.parse(String(row.data)) as T : undefined;
  }
  put<T extends { id: string }>(collection: string, value: T): T {
    this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection, value.id, JSON.stringify(value));
    return value;
  }
  deleteExam(id:string){
    if(!this.get('exams',id))throw new StudentError('Assessment not found');
    this.db.exec('BEGIN');try{this.remove('attempts',id);this.remove('exams',id);this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  remove(collection: string, id: string) { this.db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection, id); }
  preferences(): StudentPreferences {
    const saved=this.get<StudentPreferences>('meta','preferences');return {responseLanguage:saved?.responseLanguage??'auto',reminders:saved?.reminders??true,grade:saved?.grade??''};
  }
  setPreferences(raw: Record<string, unknown>) {
    if (!['auto','en','zh-CN'].includes(String(raw.responseLanguage)) || typeof raw.reminders !== 'boolean') throw new StudentError('Invalid preferences');
    if(raw.grade!==undefined&&!['','G10-PreIB','G11-IBDP','G12-IBDP'].includes(String(raw.grade)))throw new StudentError('Invalid grade');
    return this.put('meta', { id: 'preferences',grade:(raw.grade??this.preferences().grade??'') as StudentPreferences['grade'], responseLanguage: raw.responseLanguage as StudentPreferences['responseLanguage'], reminders: raw.reminders });
  }
  saveEvent(raw: unknown, id: string = randomUUID(), agent = false): StudyEvent {
    const event = { ...validateEvent(raw), id };
    const before = this.get<StudyEvent>('events', id);
    if (agent && event.kind === 'study' && !event.completed) {
      const others = this.list<StudyEvent>('events').filter(e => e.id !== id && !e.completed);
      if (others.some(e => Date.parse(e.start) < Date.parse(event.end) && Date.parse(e.end) > Date.parse(event.start))) throw new StudentError('This time overlaps an existing commitment. Choose another time.');
      const study=others.filter(e=>e.kind==='study');
      if(study.some(e=>{const gap=Math.max(Date.parse(e.start)-Date.parse(event.end),Date.parse(event.start)-Date.parse(e.end));return gap>=0&&gap<10*60000;})) throw new StudentError('Leave at least a 10-minute break between study sessions');

    }
    const nested = this.db.isTransaction;
    if (!nested) this.db.exec('BEGIN');
    try { this.put('events', event); this.log(before ? 'update' : 'create', id, before, event); if (!nested) this.db.exec('COMMIT'); }
    catch (error) { if (!nested) this.db.exec('ROLLBACK'); throw error; }
    return event;
  }
  deleteEvent(id: string) {
    const before = this.get<StudyEvent>('events', id);
    if (!before) throw new StudentError('Event not found');
    this.db.exec('BEGIN');
    try { this.remove('events', id); this.log('delete', id, before); this.db.exec('COMMIT'); }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  discardPlan(id:string){const plan=this.get<{id:string;title:string}>('plans',id);if(!plan)throw new StudentError('Pending plan not found');this.db.exec('BEGIN');try{this.remove('plans',id);this.log('plan-discard',id,plan);this.db.exec('COMMIT');return plan;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  private log(action: string, entity: string, before?: unknown, after?: unknown) {
    this.db.prepare('INSERT INTO activity(at,action,entity,before_data,after_data) VALUES (?,?,?,?,?)').run(new Date().toISOString(), action, entity, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null);
  }
  activity() { return this.db.prepare('SELECT id,at,action,entity,undone FROM activity ORDER BY id DESC LIMIT 30').all(); }
  undo() {
    const row = this.db.prepare('SELECT * FROM activity WHERE undone=0 ORDER BY id DESC LIMIT 1').get();
    if (!row) throw new StudentError('Nothing to undo');
    this.db.exec('BEGIN');
    try {
      if(row.action==='plan-discard')this.put('plans',JSON.parse(String(row.before_data)) as {id:string});
      else if(row.action==='batch-create'){for(const event of JSON.parse(String(row.after_data)) as StudyEvent[])this.remove('events',event.id);}
      else if (row.before_data) this.put('events', JSON.parse(String(row.before_data)) as StudyEvent);
      else this.remove('events', String(row.entity));
      this.db.prepare('UPDATE activity SET undone=1 WHERE id=?').run(row.id!);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  mistakeImageData(image:MistakeImage){if(image.data)return image.data;if(!image.id||!/^[a-f0-9-]+\.(png|jpg|webp|gif)$/.test(image.id))throw new StudentError('Invalid screenshot id');return readFileSync(join(this.directory,'mistake-images',image.id)).toString('base64');}
  findDocument<T>(source:string,folderId?:string,relativePath?:string):T|undefined {
    const row=folderId?this.db.prepare("SELECT data FROM records WHERE collection='documents' AND json_extract(data,'$.folderId')=? AND json_extract(data,'$.relativePath')=? LIMIT 1").get(folderId,relativePath??''):this.db.prepare("SELECT data FROM records WHERE collection='documents' AND json_extract(data,'$.source')=? AND json_extract(data,'$.folderId') IS NULL LIMIT 1").get(source);
    return row?JSON.parse(String(row.data)) as T:undefined;
  }
  saveMistake(raw: Record<string, unknown>, id: string = randomUUID()) {
    const images=raw.images===undefined?(this.get<Mistake>('mistakes',id)?.images??[]):raw.images;
    if(!Array.isArray(images)||images.length>4)throw new StudentError('Attach up to 4 screenshots per mistake');
    const previous=this.get<Mistake>('mistakes',id)?.images??[];
    const savedImages:MistakeImage[]=images.map(image=>{
      if(!image||!['question','answer','correction'].includes(image.field)||!['image/png','image/jpeg','image/webp','image/gif'].includes(image.mimeType))throw new StudentError('Invalid screenshot');
      if(image.id){const existing=previous.find(i=>i.id===image.id&&i.mimeType===image.mimeType);if(!existing)throw new StudentError('Screenshot does not belong to this mistake');return {...existing,field:image.field};}
      if(typeof image.data!=='string'||image.data.length>7*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)||Buffer.from(image.data,'base64').length>5*1024*1024)throw new StudentError('Invalid screenshot (5 MB per image maximum)');
      const ext=image.mimeType==='image/jpeg'?'jpg':image.mimeType.slice(6);const imageId=randomUUID()+'.'+ext;const directory=join(this.directory,'mistake-images');mkdirSync(directory,{recursive:true});writeFileSync(join(directory,imageId),Buffer.from(image.data,'base64'));return {field:image.field,mimeType:image.mimeType,id:imageId,url:`/api/student/mistake-images/${imageId}`};
    });
    const question=typeof raw.question==='string'&&raw.question.trim()?raw.question:(images.some(i=>i.field==='question')?'[Screenshot question]':raw.question);
    return this.put<Mistake>('mistakes', { id, subject: text(raw.subject, 'subject', 100), topic: text(raw.topic, 'topic', 200), question: text(question, 'question'), images:savedImages, answer: typeof raw.answer === 'string' ? raw.answer.slice(0, 10000) : '', correction: typeof raw.correction === 'string' ? raw.correction.slice(0, 10000) : '', resolved: raw.resolved === true, createdAt: this.get<Mistake>('mistakes', id)?.createdAt ?? new Date().toISOString() });
  }
  saveExam(raw: Record<string, unknown>, id: string = randomUUID()) {
    if (!Array.isArray(raw.questions) || raw.questions.length < 1 || raw.questions.length > 40) throw new StudentError('Provide 1–40 questions');
    const questions = raw.questions.map((q: Record<string, unknown>) => {
      if (!Number.isInteger(q.marks) || Number(q.marks) < 1 || Number(q.marks) > 30 || !Array.isArray(q.markingPoints) || !q.markingPoints.length) throw new StudentError('Each question needs marks and marking points');
      return { prompt: text(q.prompt, 'question', 10000), topic: text(q.topic, 'topic', 200), marks: Number(q.marks), markingPoints: q.markingPoints.map(p => text(p, 'marking point', 2000)) };
    });
    const sources = Array.isArray(raw.sources) ? raw.sources.map((s: Record<string, unknown>) => {
      const url = text(s.url, 'source URL'); if (!/^https:\/\//.test(url)) throw new StudentError('Sources require HTTPS');
      const evidence=this.get<{title:string;checkedAt:string}>('research',url);
      return { url, title: text(s.title, 'source title', 300), ...(evidence?{checkedAt:evidence.checkedAt}:{}) };
    }) : [];
    // A model-supplied URL is not proof of official equivalence. MVP always uses the conservative label.
    return this.put<PracticeTest>('exams', { id, title: text(raw.title, 'title', 200), subject: text(raw.subject, 'subject', 100), syllabus: typeof raw.syllabus === 'string' ? raw.syllabus : '', session: typeof raw.session === 'string' ? raw.session : '', paper: typeof raw.paper === 'string' ? raw.paper : '', minutes: Math.max(5, Math.min(240, Number(raw.minutes) || 30)), instructions: text(raw.instructions, 'instructions', 5000), questions, sources, format: 'general-practice', createdAt: this.get<PracticeTest>('exams',id)?.createdAt ?? new Date().toISOString() });
  }
  indexDocument(id: string, source: string, pages: Array<{pageNumber: number; text: string}>) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM document_chunks WHERE document_id=?').run(id);
      const insert = this.db.prepare('INSERT INTO document_chunks VALUES (?,?,?,?)');
      for (const page of pages) for (let i=0; i<page.text.length; i+=1500) insert.run(id, source, page.pageNumber, page.text.slice(i,i+1800));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  removeDocument(id: string) {
    this.db.prepare('DELETE FROM document_chunks WHERE document_id=?').run(id);
    this.remove('documents',id);
  }
  search(query: string) {
    const terms = query.match(/[\p{L}\p{N}]+/gu)?.slice(0,12) ?? [];
    if (!terms.length) return [];
    // LIKE also handles Chinese phrases without requiring a language-specific FTS tokenizer.
    const clause = terms.map(() => 'content LIKE ? ESCAPE \'\\\'').join(' OR ');
    return this.db.prepare(`SELECT document_id,source,page,substr(content,1,1800) AS content FROM document_chunks WHERE ${clause} LIMIT 12`).all(...terms.map(t => `%${t.replace(/[\\%_]/g, '\\$&')}%`));
  }
  export() { return { version: 1, exportedAt: new Date().toISOString(), events: this.list('events'), mistakes: this.list('mistakes'), exams: this.list('exams'), attempts: this.list('attempts'), capsules:this.list('capsules'), preferences: this.preferences() }; }
}

const stores = new Map<string, StudentStore>();
export function studentStore(directory: string) {
  let store = stores.get(directory); if (!store) { store = new StudentStore(directory); stores.set(directory, store); } return store;
}


