import { createHash } from 'node:crypto';
import type { ApprovalPrompt, InputReady } from '../../shared/api.js';
export interface ApprovalDetector { detect(text: string, capturedAt: string): ApprovalPrompt | null }
const approvalPattern = /Do you want to|Would you like to|Allow .*\?|\[y\/n\]|\(yes\/no\)/i;
export const simpleApprovalDetector: ApprovalDetector = {
 detect(text,capturedAt) {
  const tail = text.split('\n').slice(-40).join('\n');
  const question = tail.split('\n').find(line => approvalPattern.test(line));
  return question ? { agentKind: 'generic', question: question.trim(), options: [], fingerprint: createHash('sha256').update(tail).digest('hex'), capturedAt } : null;
 }
};
export function assessInputReady(text: string, { approval }: { approval: ApprovalPrompt | null }): InputReady {
 const lines = text.split('\n').slice(-40);
 const reject = (reason: string): InputReady => ({ ok: false, reason });
 if (approval || approvalPattern.test(lines.join('\n'))) return reject('approval_pending');
 if (lines.some((line,i) => /^\s*[❯›>]\s*\d+\./.test(line) || (/^\s*\d+\.\s/.test(line) && /^\s*\d+\.\s/.test(lines[i + 1] ?? '')))) return reject('menu_open');
 const index = lines.findLastIndex(line => /^\s*[│ ]*[❯›]/.test(line));
 if (index < 0) return reject('prompt_not_found');
 if (lines.slice(index + 1).some(line => /^\s*[/@]\S+/.test(line))) return reject('completion_open');
 if (lines[index]!.replace(/^\s*[│ ]*[❯›]/,'').replace(/[\u00a0│]/g,'').trim()) return reject('input_not_empty');
 return { ok: true };
}
