import { expect, it } from 'vitest';
import { stripAnsi } from '../../src/server/text.js';
import { redact } from '../../src/server/log.js';
it('removes CSI, OSC, escape and control characters while preserving text',() => {
 expect(stripAnsi('\x1b[31mRed\x1b[0m\x1b]0;title\x07\x00\r\n\tOK\x1b7')).toBe('Red\n\tOK');
});
it('redacts to length and short hash',() => {
 expect(redact('secret')).toEqual({ len: 6, sha256: '2bb80d537b1d' });
});
