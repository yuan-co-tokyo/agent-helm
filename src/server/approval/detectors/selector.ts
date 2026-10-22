import type { AgentKind } from '../../../shared/api.js';
import { fingerprint, stripFrame } from '../normalize.js';
import type { RawPrompt } from './numbered.js';
export function detectSelector(lines: string[], capturedAt: string, agentKind: AgentKind): RawPrompt | null {
 const clean = lines.map(stripFrame);
 let footer = clean.length - 1;
 while (footer >= 0 && !clean[footer]) footer--;
 if (!/^enter to confirm\b/i.test(clean[footer] ?? '')) return null;
 let end = footer - 1;
 while (end >= 0 && !clean[end]) end--;
 let start = end;
 while (start > 0 && clean[start - 1]) start--;
 const options = clean.slice(start,end + 1);
 if (options.length < 2 || options.filter(line => /^❯/.test(line)).length !== 1 || options.some(line => /^(?:❯\s*)?\d+\.\s/.test(line))) return null;
 const lower = Math.max(0,start - 15);
 for (let q = start - 1; q >= lower; q--) {
  if (!clean[q]!.includes('?')) continue;
  let first = q, last = q;
  while (first > lower && clean[first - 1]) first--;
  while (last < start - 1 && clean[last + 1]) last++;
  const question = clean.slice(first,last + 1).join(' ');
  let regionStart = first;
  for (let i = first - 1; i >= Math.max(0,first - 12); i--) {
   if (/^\s*[─━]{3,}\s*$/.test(lines[i]!)) { regionStart = i + 1; break; }
  }
  const detail = [...clean.slice(regionStart,first),...clean.slice(last + 1,start)].filter(Boolean)
   .concat('選択肢: ' + options.map(line => line.replace(/^❯\s*/,'')).join(' / ')).join('\n');
  return { agentKind, kind: /trust/i.test(question + detail) ? 'trust' : 'approval', question, detail,
   options: [], terminalOnly: true, fingerprint: fingerprint(lines.slice(regionStart,end + 1)), capturedAt, end };
 }
 return null;
}
