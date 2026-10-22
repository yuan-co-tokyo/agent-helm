import { stripVTControlCharacters } from 'node:util';
export function stripAnsi(text: string): string {
 return [...stripVTControlCharacters(text)].filter(c => c === '\n' || c === '\t' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !(c.charCodeAt(0) >= 128 && c.charCodeAt(0) <= 159))).join('');
}
