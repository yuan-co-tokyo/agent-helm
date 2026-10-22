import type { ApprovalDetector } from '../status/types.js';
import { detectApproval, toApprovalPrompt } from './detect.js';
export function createApprovalDetector(targetKind: 'task' | 'orchestrator'): ApprovalDetector {
 return { detect(text, capturedAt, agentHint) {
  const raw = detectApproval(text, { capturedAt, agentHint });
  return raw ? toApprovalPrompt(raw, targetKind) : null;
 } };
}
