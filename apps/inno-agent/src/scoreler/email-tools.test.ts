import {it,expect,vi,afterEach} from 'vitest';import {createEmailTools} from './email-tools.js';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('provides read-only tools and sends bounded requests to the authenticated desktop bridge',async()=>{
 vi.stubEnv('SCORELER_MAIL_PORT','54321');vi.stubEnv('SCORELER_MAIL_TOKEN','test-token');const request=vi.fn(async(_url:string,_options?:RequestInit)=>new Response(JSON.stringify({items:[{uid:7,subject:'Homework'}]}),{status:200}));vi.stubGlobal('fetch',request);
 const tools=createEmailTools();expect(tools.map(t=>t.name)).toEqual(['student_email_search','student_email_read']);const result=await tools[0].execute('test',{since:'2026-10-20',before:'2026-10-21'} as any,undefined,undefined,{} as any);expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:54321/search');expect((request.mock.calls[0] as any)[1].headers.Authorization).toBe('Bearer test-token');expect(JSON.stringify(result)).toContain('untrusted reference data');expect(JSON.stringify(result)).toContain('Homework');
});

