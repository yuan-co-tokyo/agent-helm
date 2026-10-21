import type { AgentKind, ApprovalPrompt } from '../../../shared/api.js';
import { fingerprint, stripFrame } from '../normalize.js';
import { classifyMeaning } from '../meaning.js';
export type RawPrompt = Omit<ApprovalPrompt,'options'> & { options: (Omit<ApprovalPrompt['options'][number],'sendable'> & { requiresFullWord?: boolean })[]; end: number };
const footer = (line: string) => !line || /^(press enter\b.*|esc to cancel\b.*|enter continue.*|[↑↓].*)$/i.test(line);
const option = /^(?:[❯›>▶]\s*)?([1-9])\.\s+(.+)$/;
export function detectNumbered(lines: string[], capturedAt: string, agentKind: AgentKind, questionStart: RegExp): RawPrompt | null {
 const clean = lines.map(stripFrame);
 let end = clean.length - 1;
 while (end >= 0 && footer(clean[end]!)) end--;
 for (let start = end; start >= 0; start--) {
  if (!/^(?:[❯›>▶]\s*)?1\.\s+/.test(clean[start]!)) continue;
  if (clean.slice(start,end + 1).some(line => line.startsWith(agentKind === 'claude' ? '›' : '❯'))) continue;
  const options: RawPrompt['options'] = [];
  let valid = true;
  for (let i = start; i <= end; i++) {
   const match = clean[i]!.match(option);
   if (match) {
    if (Number(match[1]) !== options.length + 1) { valid = false; break; }
    options.push({ key: match[1]!, label: match[2]!, shortcut: null, meaning: 'unknown', warn: false });
   } else if (clean[i] && /^\s{2,}\S/.test(lines[i]!.replace(/^[│┃]/,'')) && !/^[❯›>▶]/.test(clean[i]!)) {
    const previous = options.at(-1);
    if (!previous) { valid = false; break; }
    previous.label += ' ' + clean[i];
   } else { valid = false; break; }
  }
  if (!valid || options.length < 2) continue;
  for (let q = start - 1; q >= 0; q--) {
   if (!questionStart.test(clean[q]!)) continue;
   let questionEnd = q;
   while (questionEnd < start - 1 && !clean[questionEnd]!.includes('?') && clean[questionEnd + 1]) questionEnd++;
   const question = clean.slice(q,questionEnd + 1).join(' ');
   if (!question.includes('?')) continue;
   for (const item of options) {
    const shortcut = item.label.match(/\s+\((\w+)\)$/);
    if (shortcut) { item.shortcut = shortcut[1]!; item.label = item.label.slice(0,shortcut.index); }
    item.meaning = classifyMeaning(item.label); item.warn = item.meaning === 'approve_always';
   }
   return { agentKind, kind: /trust/i.test(question) ? 'trust' : 'approval', question, detail: clean.slice(questionEnd + 1,start).filter(Boolean).join('\n') || null, options, fingerprint: fingerprint(lines.slice(q,end + 1)), capturedAt, end };
  }
 }
 return null;
}
