import React from 'react';import {it,expect,vi,afterEach} from 'vitest';import {render,screen,fireEvent,cleanup} from '@testing-library/react';import {EmailPage} from './EmailPage.js';
vi.mock('./EmailContent.js',()=>({EmailContent:({text}:any)=><div className="test-email-content">{text}</div>}));
afterEach(()=>{cleanup();delete window.scorelerDesktop;vi.restoreAllMocks();});
it('replaces the previous message and header across repeated selections',async()=>{
 const messages=[1,2,3].map(uid=>({uid,subject:'Message '+uid,from:'Sender '+uid,date:'2026-10-20T10:00:00Z'}));
 window.scorelerDesktop={mail:vi.fn(async(action,uid)=>action==='state'?{configured:true,account:{email:'student@school.test',host:'imap.school.test',notifications:true},messages,error:'',lastSync:null}:({...messages.find(m=>m.uid===uid),to:'Recipient '+uid,text:'Content '+uid,attachments:[]}))} as any;
 render(<EmailPage en notice={vi.fn()} sendToAI={vi.fn()} openLink={vi.fn()}/>);
 await screen.findByRole('button',{name:/Message 1/});
 for(const uid of [1,2,3,1,2,3]){fireEvent.click(screen.getByRole('button',{name:new RegExp('Message '+uid)}));await screen.findByRole('heading',{name:'Message '+uid});expect(document.querySelectorAll('.email-body .email-addresses').length).toBe(1);expect(document.querySelectorAll('.email-body .test-email-content').length).toBe(1);expect(document.querySelector('.email-body')?.textContent).toContain('Recipient '+uid);for(const other of [1,2,3].filter(id=>id!==uid))expect(document.querySelector('.email-body')?.textContent).not.toContain('Recipient '+other);}
});
