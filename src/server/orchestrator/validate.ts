export function validateInstruction(text: unknown, maxChars: number): { ok: true } | { ok: false; status: 400|413; reason: 'empty'|'too_long'|'control_char'|'invalid_type' } {
 if (typeof text !== 'string') return { ok: false, status: 400, reason: 'invalid_type' };
 if ([...text].length > maxChars) return { ok: false, status: 413, reason: 'too_long' };
 for (const char of text) {
  const code = char.codePointAt(0)!;
  if ((code < 32 && code !== 9 && code !== 10) || (code >= 127 && code <= 159) || (code >= 0xd800 && code <= 0xdfff)) return { ok: false, status: 400, reason: 'control_char' };
 }
 if (!text.trim()) return { ok: false, status: 400, reason: 'empty' };
 return { ok: true };
}
