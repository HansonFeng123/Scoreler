import {expect,it} from 'vitest';
import {calculate} from './arithmetic.js';
it('evaluates precedence, parentheses, unary signs, decimals and percentages',()=>{expect(calculate('(12+8)×5')).toBe(100);expect(calculate('2+3*4')).toBe(14);expect(calculate('-3 * -2')).toBe(6);expect(calculate('200*15%')).toBe(30);expect(calculate('0.1+0.2')).toBe(.3);expect(calculate('1e3/4')).toBe(250);});
it('rejects zero division, malformed expressions, code and overflow',()=>{for(const value of ['1/0','(1+2','2foo','globalThis.process.exit()','1e999',''])expect(()=>calculate(value)).toThrow();});

