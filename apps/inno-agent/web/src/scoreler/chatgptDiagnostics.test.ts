import {it,expect} from 'vitest';
import {chatgptDiagnostic} from './chatgptDiagnostics.js';
it('shows safe actionable HTTP restriction diagnostics without remote error details',()=>{
 const value=chatgptDiagnostic({code:'api_error',status:403,message:'synthetic-secret',url:'https://example.invalid/private'},true);
 expect(value.code).toBe('HTTP 403');expect(value.message).toContain('will not bypass');expect(JSON.stringify(value)).not.toMatch(/synthetic-secret|private/);
 expect(chatgptDiagnostic({code:'arbitrary-secret-code',message:'synthetic-secret'},true).code).toBe('connection_error');
});
