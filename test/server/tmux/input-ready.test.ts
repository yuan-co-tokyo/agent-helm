import { expect, it } from 'vitest';
import { assessInputReady } from '../../../src/server/tmux/input-ready.js';
it('conservatively recognizes prompts and blocking screens',() => {
 for (const [text,reason] of [['Do you want to proceed?\n❯','approval_pending'],['[y/N]\n❯','approval_pending'],['❯ 1. Yes','menu_open'],['1. Yes\n2. No\n❯','menu_open'],['❯\n /help','completion_open'],['❯ abc','input_not_empty'],['running','prompt_not_found']]) expect(assessInputReady(text!,{ approval: null })).toEqual({ ok: false, reason });
 for (const text of ['❯ ','› \u00a0│','old\n❯','Would you like to continue?\n1. a\n2. b\n\n─────\n❯ \n─────']) expect(assessInputReady(text,{ approval: null })).toEqual({ ok: true });
 const approval = { confirm:'key' as const,agentKind: 'claude' as const, kind: 'trust' as const, terminalOnly: true as const, question: 'Trust?', detail: null, options: [], fingerprint: 'a'.repeat(64), capturedAt: 'now' };
 expect(assessInputReady('❯',{ approval })).toMatchObject({ reason: 'approval_pending' });
});
