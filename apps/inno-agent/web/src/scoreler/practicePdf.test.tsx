import {writeFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
import {downloadPracticePdf} from './practicePdf.js';
it('exports questions and writing space without answers or marking schemes',async()=>{
 Object.defineProperty(document,'fonts',{configurable:true,value:{ready:Promise.resolve()}});
 const save=vi.fn(async(_paper:{html:string;title:string})=>true);window.scorelerDesktop={savePracticePdf:save} as any;
 await downloadPracticePdf({id:'paper',title:'化学 Chemistry',subject:'Chemistry',minutes:60,instructions:'Answer all questions.',format:'general-practice',sources:[],questions:[{topic:'Atomic structure',prompt:'Find the mass of magnesium.',marks:3,markingPoints:['SECRET ANSWER']}]} as any,'zh-CN');
 expect(save).toHaveBeenCalledOnce();const {html,title}=save.mock.calls[0][0] as any;if(process.env.SCORELER_PDF_VERIFY)writeFileSync('runtime/practice-pdf-check.html',html);expect(title).toBe('化学 Chemistry');expect(html).toContain('Find the mass of magnesium.');expect(html).toContain('paper-answer-space');expect(html).not.toContain('SECRET ANSWER');expect(document.querySelector('.practice-paper')).toBeNull();delete window.scorelerDesktop;
});
