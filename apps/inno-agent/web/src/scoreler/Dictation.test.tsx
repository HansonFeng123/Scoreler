import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {Dictation,dictationHtml} from './Dictation.js';
import {apiFetch} from '../api/client.js';
vi.mock('../api/client.js',()=>({apiFetch:vi.fn()}));
Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});
Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.removeAttribute('open');}});
afterEach(()=>{cleanup();vi.resetAllMocks();});
const sheet={id:'example',title:'<Fruit>',subject:'Biology',language:'en',createdAt:'2026-01-01',items:[{prompt:'A red fruit',answer:'apple'}]};
it('exports a blank worksheet by default and escapes content',()=>{expect(dictationHtml(sheet,false)).not.toContain('apple');expect(dictationHtml(sheet,true)).toContain('apple');expect(dictationHtml(sheet,false)).toContain('&lt;Fruit&gt;');});
it('browses subjects and submits typed answers with correction',async()=>{
 const marked={...sheet,attempt:{answers:['aple'],correct:[false],feedback:['Spell it apple.'],submittedAt:'2026-01-02'}};
 vi.mocked(apiFetch).mockImplementation(async(path:any)=>path==='/api/student/dictations'?[sheet]:path.includes('/subject-folders')?[]:path.endsWith('/submit')?marked:{saved:true});
 render(<Dictation en notice={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:/Biology/}));fireEvent.click(screen.getByRole('button',{name:'Open exercise'}));
 fireEvent.change(await screen.findByLabelText('Answer 1'),{target:{value:'aple'}});fireEvent.change(screen.getByLabelText('Grading instructions (optional)'),{target:{value:'Accept synonyms.'}});fireEvent.click(screen.getByText('Submit for AI correction'));await screen.findByText(/Spell it apple/);
 expect(apiFetch).toHaveBeenCalledWith('/api/student/dictations/example/submit',expect.objectContaining({body:JSON.stringify({answers:['aple'],gradingInstructions:'Accept synonyms.'})}));
});
it('shows read-only saved attempts without overwriting the current draft',async()=>{
 const current={...sheet,draftAnswers:['current draft']},attempt={id:'attempt-one',sheetId:sheet.id,answers:['older answer'],correct:[false],feedback:['Earlier feedback'],submittedAt:'2026-01-01'};
 vi.mocked(apiFetch).mockImplementation(async(path:any)=>path==='/api/student/dictations'?[current]:path.endsWith('/history')?[attempt]:[]);
 render(<Dictation en notice={vi.fn()} sheetId={sheet.id}/>);await screen.findByDisplayValue('current draft');fireEvent.click(screen.getByRole('button',{name:'Answer history'}));fireEvent.click(await screen.findByRole('button',{name:/Attempt 1/}));
 expect((screen.getByLabelText('Answer 1') as HTMLTextAreaElement).disabled).toBe(true);expect(screen.getByDisplayValue('older answer')).toBeTruthy();expect(screen.getByText(/Earlier feedback/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Return to current draft'}));expect(screen.getByDisplayValue('current draft')).toBeTruthy();expect(vi.mocked(apiFetch).mock.calls.some(([,options])=>options?.method==='PUT')).toBe(false);
});
it('requires confirmation and deletes only the selected exercise',async()=>{
 vi.mocked(apiFetch).mockImplementation(async(path:any)=>path==='/api/student/dictations'?[sheet]:[]);
 render(<Dictation en notice={vi.fn()}/>);fireEvent.click(await screen.findByRole('button',{name:/Biology/}));fireEvent.click(screen.getByRole('button',{name:'Delete <Fruit>'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(vi.mocked(apiFetch).mock.calls.some(([,options])=>options?.method==='DELETE')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Delete <Fruit>'}));fireEvent.click(screen.getByRole('button',{name:'Delete'}));await waitFor(()=>expect(apiFetch).toHaveBeenCalledWith('/api/student/dictations/example',{method:'DELETE'}));await waitFor(()=>expect(screen.queryByRole('button',{name:'Open exercise'})).toBeNull());
});
