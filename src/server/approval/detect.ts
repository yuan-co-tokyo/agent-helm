import { AGTX_KEYS, ORCHESTRATOR_KEYS, type ApprovalPrompt } from '../../shared/api.js';
import { tailLines } from './normalize.js';
import { detectClaude, detectClaudeSelector } from './detectors/claude.js';
import { detectCodex } from './detectors/codex.js';
import { detectGeneric } from './detectors/generic.js';
import type { RawPrompt } from './detectors/numbered.js';
export function detectApproval(text: string, { capturedAt, agentHint }: { capturedAt: string; agentHint?: string | null }): RawPrompt | null {
 const lines = tailLines(text);
 return [detectClaude(lines,capturedAt),detectClaudeSelector(lines,capturedAt),detectCodex(lines,capturedAt),detectGeneric(lines,capturedAt)]
  .filter((prompt): prompt is RawPrompt => prompt !== null)
  .sort((a,b) => b.end - a.end || Number(b.agentKind === agentHint) - Number(a.agentKind === agentHint))[0] ?? null;
}
export function toApprovalPrompt(raw: RawPrompt, targetKind: 'task'|'orchestrator'): ApprovalPrompt {
 const { end: _end, options, ...prompt } = raw;
 void _end;
 const keys: readonly string[] = targetKind === 'task' ? AGTX_KEYS : ORCHESTRATOR_KEYS;
 return { ...prompt, options: options.map(({ requiresFullWord, ...option }) => {
  const sendable = !requiresFullWord && keys.includes(option.key);
  return { ...option, sendable, ...(!sendable ? { unsendableReason: 'key_not_in_target_set' as const } : {}) };
 }) };
}
