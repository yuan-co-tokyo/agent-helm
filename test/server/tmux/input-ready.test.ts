import { expect, it } from 'vitest';
import { assessInputReady, simpleApprovalDetector } from '../../../src/server/tmux/input-ready.js';
it('conservatively recognizes prompts and blocking screens',() => {
 for (const [text,reason] of [['Do you want to proceed?\n❯','approval_pending'],['[y/N]\n❯','approval_pending'],['❯ 1. Yes','menu_open'],['1. Yes\n2. No\n❯','menu_open'],['❯\n /help','completion_open'],['❯ abc','input_not_empty'],['running','prompt_not_found']]) expect(assessInputReady(text!,{ approval: null })).toEqual({ ok: false, reason });
 for (const text of ['❯ ','› \u00a0│','old\n❯']) expect(assessInputReady(text,{ approval: null })).toEqual({ ok: true });
 const approval = simpleApprovalDetector.detect('Allow execution?','now');
 expect(approval).toMatchObject({ capturedAt: 'now', agentKind: 'generic' });
 expect(assessInputReady('❯',{ approval })).toMatchObject({ reason: 'approval_pending' });
});
