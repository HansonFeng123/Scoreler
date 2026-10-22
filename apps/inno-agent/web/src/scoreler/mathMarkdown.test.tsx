import React from 'react';import {it,expect} from 'vitest';import {render,cleanup} from '@testing-library/react';import {Streamdown} from 'streamdown';import {createMathPlugin} from '@streamdown/math';import {mathMarkdown} from './mathMarkdown.js';
it('renders legacy slash math within Markdown tables and preserves code literals',()=>{const source=String.raw`| Answer | Step |
|---|---|
| 13 N | \(\sqrt{12^2+5^2}\), \(\tan\theta=5/12\) |`;
const {container}=render(<Streamdown plugins={{math:createMathPlugin({singleDollarTextMath:true})}}>{mathMarkdown(source)}</Streamdown>);expect(container.querySelectorAll('.katex').length).toBe(2);expect(container.querySelector('table')).toBeTruthy();cleanup();const code='`'+String.raw`\(\cos30\)`+'`';expect(mathMarkdown(code)).toBe(code);expect(mathMarkdown(String.raw`\[x^2\]`)).toContain('$$\nx^2\n$$');expect(mathMarkdown('$x^2$')).toBe('$x^2$');});
