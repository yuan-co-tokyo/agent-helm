import { expect, it } from 'vitest';
import { validateInstruction as validate } from '../../../src/server/orchestrator/validate.js';
it('counts code points and rejects invalid input without truncation',() => {
 for (const text of ['a'.repeat(8000),'😀'.repeat(8000),'日本語\t\n']) expect(validate(text,8000)).toEqual({ ok: true });
 expect(validate('a'.repeat(8001),8000)).toMatchObject({ status: 413, reason: 'too_long' });
 for (const text of ['', ' \t\n', 1, null, '\0', '\r', '\x1b', '\x7f', '\x80', '\ud800']) expect(validate(text,8000).ok).toBe(false);
});
