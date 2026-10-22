import { fingerprint, stripFrame } from '../normalize.js';
import type { RawPrompt } from './numbered.js';
export function detectGeneric(lines: string[], capturedAt: string): RawPrompt | null {
 let end = lines.length - 1;
 while (end >= 0 && !stripFrame(lines[end]!)) end--;
 const question = stripFrame(lines[end] ?? '');
 const match = question.match(/(?:\[(y\/n|yes\/no)\]|\((y\/n|yes\/no)\))/i);
 if (!match) return null;
 const full = (match[1] ?? match[2])!.toLowerCase() === 'yes/no';
 return { agentKind: 'generic', kind: 'approval', question, detail: null, capturedAt, end, fingerprint: fingerprint([question]), options: [
  { key: 'y', label: 'yes', shortcut: null, meaning: 'approve', warn: false, requiresFullWord: full },
  { key: 'n', label: 'no', shortcut: null, meaning: 'deny', warn: false, requiresFullWord: full }
 ] };
}
