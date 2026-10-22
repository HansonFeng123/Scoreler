import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StudentStore, validateEvent, type StudyEvent } from './store.js';
const opened:Array<{store:StudentStore;dir:string}>=[];
function setup(){const dir=mkdtempSync(join(tmpdir(),'scoreler-test-'));const store=new StudentStore(dir);opened.push({store,dir});return store;}
afterEach(()=>{for(const {store,dir} of opened.splice(0)){store.close();rmSync(dir,{recursive:true,force:true});}});
const event={title:'Waves revision',subject:'physics',start:'2026-11-01T16:00:00+08:00',end:'2026-11-01T16:45:00+08:00',kind:'study' as const,completed:false};
describe('Scoreler study records',()=>{
 it('validates time ranges and rejects corrupt events',()=>{expect(()=>validateEvent({...event,end:event.start})).toThrow();expect(()=>validateEvent({...event,start:'tomorrow'})).toThrow();expect(()=>validateEvent({...event,completed:'false'})).toThrow();});
 it('persists events and supports update, complete, delete and undo',()=>{const s=setup();const e=s.saveEvent(event);expect(s.list('events')).toHaveLength(1);s.saveEvent({...e,completed:true},e.id);expect(s.get<StudyEvent>('events',e.id)?.completed).toBe(true);s.undo();expect(s.get<StudyEvent>('events',e.id)?.completed).toBe(false);s.deleteEvent(e.id);expect(s.list('events')).toHaveLength(0);s.undo();expect(s.list('events')).toHaveLength(1);});
 it('blocks overlaps but allows study beyond the removed daily cap',()=>{const s=setup();s.saveEvent(event);expect(()=>s.saveEvent({...event,title:'Overlapping'},undefined,true)).toThrow(/overlap/);s.setPreferences({dailyMinutes:45,responseLanguage:'auto',reminders:true});expect(()=>s.saveEvent({...event,start:'2026-11-01T18:00:00+08:00',end:'2026-11-01T23:30:00+08:00'},undefined,true)).not.toThrow();});
 it('finds Chinese and English document evidence with page references',()=>{const s=setup();s.indexDocument('a','Physics notes.pdf',[{pageNumber:3,text:'Interference occurs when waves superpose. 干涉现象发生在波叠加时。'}]);expect(s.search('interference')).toMatchObject([{source:'Physics notes.pdf',page:3}]);expect(s.search('干涉')).toHaveLength(1);expect(s.search('" OR 1=1 --')).toHaveLength(0);s.indexDocument('a','Physics notes.pdf',[{pageNumber:4,text:'Updated notes'}]);expect(s.search('interference')).toHaveLength(0);});
 it('saves corrections independently of chat and exports real records',()=>{const s=setup();s.saveMistake({subject:'physics',topic:'Waves',question:'Why interference?',answer:'',correction:'Superposition'});expect(s.export().mistakes).toHaveLength(1);expect(s.export().events).toHaveLength(0);});
 it('requires structured marking points and never promotes model URLs to official verification',()=>{const s=setup();expect(()=>s.saveExam({questions:[{marks:2}]})).toThrow();const exam=s.saveExam({title:'Waves',subject:'physics',minutes:15,instructions:'Answer all questions',questions:[{prompt:'Explain superposition',topic:'Waves',marks:2,markingPoints:['Displacements add','At the same point']}],sources:[{url:'https://ibo.org/example',title:'Reference'}],format:'verified-ib'});expect(exam.format).toBe('general-practice');expect(exam.questions[0].marks).toBe(2);});
});

// Authoritative bulk approval: a conflicting plan must roll back every inserted session.
describe('study-plan approval',()=>{
 it('keeps proposals separate until approved and applies valid sessions',()=>{const s=setup();const plan=s.proposePlan('My week',[event,{...event,start:'2026-11-02T16:00:00+08:00',end:'2026-11-02T16:45:00+08:00'}]);expect(s.list('events')).toHaveLength(0);s.applyPlan(plan.id);expect(s.list('events')).toHaveLength(2);expect(s.list('plans')).toHaveLength(0);});
 it('rolls back the entire plan if a later session conflicts',()=>{const s=setup();s.saveEvent(event);const plan=s.proposePlan('Conflict',[{...event,start:'2026-11-02T16:00:00+08:00',end:'2026-11-02T16:45:00+08:00'},{...event,title:'Conflicting different task'}]);expect(()=>s.applyPlan(plan.id)).toThrow(/overlap/);expect(s.list('events')).toHaveLength(1);expect(s.list('plans')).toHaveLength(1);});
});

describe('revision boundaries',()=>{
 it('enforces a rest period between AI-created study sessions',()=>{const s=setup();s.saveEvent(event);expect(()=>s.saveEvent({...event,start:'2026-11-01T16:45:00+08:00',end:'2026-11-01T17:15:00+08:00'},undefined,true)).toThrow(/break/);expect(()=>s.saveEvent({...event,start:'2026-11-01T16:55:00+08:00',end:'2026-11-01T17:25:00+08:00'},undefined,true)).not.toThrow();});
 it('never invents retrieval timestamps for model-provided URLs',()=>{const s=setup();const exam=s.saveExam({title:'Original',subject:'physics',instructions:'Answer all questions',questions:[{prompt:'Explain interference',topic:'Waves',marks:1,markingPoints:['Superposition']}],sources:[{url:'https://ibo.org/reference',title:'Unretrieved reference'}]});expect(exam.sources[0].checkedAt).toBeUndefined();});
});

describe('large timetable approval',()=>{
 it('approves more than 30 sessions as one atomic proposal without an event-count limit',()=>{const s=setup();const events=Array.from({length:80},(_,i)=>{const start=new Date(2027,0,i+1,16);const end=new Date(start);end.setMinutes(45);return {...event,title:`Lesson ${i+1}`,kind:'lesson',start:start.toISOString(),end:end.toISOString()};});const plan=s.proposePlan('Full timetable',events,'conversation-123');expect(plan.sessionId).toBe('conversation-123');expect(s.list('events')).toHaveLength(0);expect(s.applyPlan(plan.id)).toHaveLength(80);expect(s.list('events')).toHaveLength(80);});
});

describe('removed daily study cap',()=>{it('ignores old saved limits and permits a long study session',()=>{const s=setup();s.put('meta',{id:'preferences',dailyMinutes:15,responseLanguage:'auto',reminders:true});expect(s.preferences()).not.toHaveProperty('dailyMinutes');const long={...event,start:'2026-12-01T08:00:00+08:00',end:'2026-12-01T20:00:00+08:00'};expect(()=>s.saveEvent(long,undefined,true)).not.toThrow();expect(s.setPreferences({responseLanguage:'en',reminders:false})).not.toHaveProperty('dailyMinutes');});});

describe('direct calendar batches',()=>{
 it('applies immediately without a pending proposal, and undoes the whole batch',()=>{const s=setup();s.saveEvent({...event,title:'Existing lesson',kind:'lesson'});const added=s.savePlan('Next week',[{...event,start:'2026-11-10T16:00:00+08:00',end:'2026-11-10T16:45:00+08:00'},{...event,start:'2026-11-11T16:00:00+08:00',end:'2026-11-11T16:45:00+08:00'}]);expect(added).toHaveLength(2);expect(s.list('plans')).toHaveLength(0);s.undo();expect(s.list('events')).toHaveLength(1);});
 it('skips exact duplicates and rolls back genuine conflicts',()=>{const s=setup();s.saveEvent(event);expect(s.savePlan('Same',[event])).toHaveLength(0);expect(()=>s.savePlan('Conflict',[{...event,start:'2026-11-02T16:00:00+08:00',end:'2026-11-02T16:45:00+08:00'},{...event,title:'Different'}])).toThrow(/overlap/);expect(s.list('events')).toHaveLength(1);});
 it('does not create default subject records',()=>{expect(setup().list('subjects')).toHaveLength(0);});
});

it('deletes only the selected practice test and its saved attempt',()=>{const store=setup();store.put('exams',{id:'one'});store.put('exams',{id:'two'});store.put('attempts',{id:'one',answers:['answer']});store.put('attempts',{id:'two',answers:['keep']});store.deleteExam('one');expect(store.get('exams','one')).toBeUndefined();expect(store.get('attempts','one')).toBeUndefined();expect(store.get('exams','two')).toBeDefined();expect(store.get('attempts','two')).toBeDefined();expect(()=>store.deleteExam('missing')).toThrow('Assessment not found');});

it('persists only supported grade choices and preserves the choice on legacy preference updates',()=>{const store=setup();expect(store.preferences().grade).toBe('');for(const grade of ['G10-PreIB','G11-IBDP','G12-IBDP']){store.setPreferences({responseLanguage:'en',reminders:true,grade});expect(store.preferences().grade).toBe(grade);}store.setPreferences({responseLanguage:'zh-CN',reminders:false});expect(store.preferences().grade).toBe('G12-IBDP');expect(()=>store.setPreferences({responseLanguage:'en',reminders:true,grade:'AP'})).toThrow('Invalid grade');});
