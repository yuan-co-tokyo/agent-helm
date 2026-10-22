import { createHash } from 'node:crypto';
import type { ApprovalPrompt, InputReady } from '../../shared/api.js';
import type { ApprovalDetector } from '../status/types.js';
export type { ApprovalDetector } from '../status/types.js';
const approvalPattern = /Do you want to|Would you like to|Allow .*\?|\[y\/n\]|\(yes\/no\)/i;
const promptPattern = /^\s*[│ ]*[❯›]/;
const numbered = /^\s*\d+\.\s/;
// Only the prompt and the block directly above it count; history separated by a blank or rule line is ignored.
function activeLines(text: string) {
 const lines = text.split('\n').slice(-40);
 const index = lines.findLastIndex(line => promptPattern.test(line));
 if (index < 0) return { lines, index };
 let start = index;
 while (start > 0 && !/^[\s─━═╭╮╰╯│┌┐└┘-]*$/.test(lines[start - 1]!)) start--;
 return { lines: lines.slice(start), index: index - start };
}
export const simpleApprovalDetector: ApprovalDetector = {
 detect(text,capturedAt) {
  const { lines } = activeLines(text);
  const question = lines.find(line => approvalPattern.test(line));
  return question ? { agentKind: 'generic', kind: 'approval', detail: '', question: question.trim(), options: [], fingerprint: createHash('sha256').update(lines.join('\n')).digest('hex'), capturedAt } : null;
 }
};
export function assessInputReady(text: string, { approval }: { approval: ApprovalPrompt | null }): InputReady {
 const { lines, index } = activeLines(text);
 const reject = (reason: string): InputReady => ({ ok: false, reason });
 if (approval || approvalPattern.test(lines.join('\n'))) return reject('approval_pending');
 if (lines.some((line,i) => /^\s*[❯›>]\s*\d+\./.test(line) || (numbered.test(line) && numbered.test(lines[i + 1] ?? '')))) return reject('menu_open');
 if (index < 0) return reject('prompt_not_found');
 if (lines.slice(index + 1).some(line => /^\s*[/@]\S+/.test(line))) return reject('completion_open');
 if (lines[index]!.replace(promptPattern,'').replace(/[\u00a0│]/g,'').trim()) return reject('input_not_empty');
 return { ok: true };
}
