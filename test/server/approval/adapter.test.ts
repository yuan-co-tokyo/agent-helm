import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createApprovalDetector } from '../../../src/server/approval/adapter.js';
import { classifyMeaning } from '../../../src/server/approval/meaning.js';
import { assessInputReady } from '../../../src/server/tmux/input-ready.js';
it('prioritizes denial over persistent approval wording', () => {
 expect(classifyMeaning("No, don't ask again")).toBe('deny');
 expect(classifyMeaning("Yes, and don't ask again")).toBe('approve_always');
});
it('uses the same fingerprint for task and orchestrator including trailing blank rows', () => {
 const pane = readFileSync('test/fixtures/panes/codex-exec-approval.txt', 'utf8');
 const task = createApprovalDetector('task').detect(pane + '\n'.repeat(60), 'now', 'codex');
 expect(task?.fingerprint).toBe(createApprovalDetector('orchestrator').detect(pane, 'later')?.fingerprint);
 expect(task?.options[0]?.sendable).toBe(true);
});
it('does not classify the Codex rate limit model menu as approval', () => {
 const text = 'Approaching rate limits\nSwitch to gpt-5.1-codex-mini?\n› 1. Switch model\n  2. Keep current model';
 const approval = createApprovalDetector('orchestrator').detect(text, 'now');
 expect(approval).toBeNull();
 expect(assessInputReady(text, { approval })).toEqual({ ok: false, reason: 'menu_open' });
});
