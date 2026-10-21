import { expect, it } from 'vitest';
import { TmuxOrchestratorAdapter } from '../../../src/server/orchestrator/tmux-adapter.js';
import { TmuxError, type TmuxRunner } from '../../../src/server/tmux/exec.js';
import type { OrchestratorKey } from '../../../src/shared/api.js';
const target = { socket: 'agent-helm-test-fake', session: 'helm', window: 'orch' };
function setup(hook?: (args: string[]) => Promise<string | undefined>) {
 const calls: { args: string[]; input?: string }[] = [];
 const runner: TmuxRunner = { async run(args,opts) { calls.push({ args, input: opts?.input }); const value = await hook?.(args); return value ?? (args[0] === 'list-panes' ? '%1\t0\tnode\n' : args[0] === 'capture-pane' ? '❯ \n' : ''); } };
 return { adapter: new TmuxOrchestratorAdapter(target,{ runner, settleMs: 0 }), calls, runner };
}
it('sends stdin through a unique buffer with one Enter',async () => {
 const { adapter,calls } = setup(); const text = '日本語\n$(touch nope)';
 expect((await adapter.sendInstruction(text)).outcome).toBe('sent');
 expect(calls.map(c => c.args[0])).toEqual(['list-panes','capture-pane','list-panes','load-buffer','list-panes','paste-buffer','send-keys','capture-pane']);
 expect(calls[0]!.args[2]).toBe('=helm:=orch');
 expect(calls[3]!.input).toBe(text);
 expect(calls.every(c => !c.args.includes(text))).toBe(true);
 expect(calls[5]!.args.slice(0,3)).toEqual(['paste-buffer','-p','-d']);
 expect(calls[6]!.args).toEqual(['send-keys','-t','%1','Enter']);
 await adapter.readScreen(12); expect(calls.at(-1)?.args).toContain('-12');
});
it('rejects missing, dead and ambiguous panes',async () => {
 for (const [rows,reason] of [['','not_found'],['%1\t1\tnode','pane_dead'],['%1\t0\tnode\n%2\t0\tnode','ambiguous'],['invalid\t0\tnode','tmux_error']]) {
  const { adapter,calls } = setup(async args => args[0] === 'list-panes' ? rows : undefined);
  expect(await adapter.sendInstruction('hello')).toEqual({ outcome: 'rejected', reason }); expect(calls).toHaveLength(1);
 }
});
it('never pastes when the target changes before or after loading',async () => {
 for (const changeAt of [2,3]) {
  let resolves = 0;
  const { adapter,calls } = setup(async args => args[0] === 'list-panes' && ++resolves >= changeAt ? '%2\t0\tnode' : undefined);
  expect(await adapter.sendInstruction('hello')).toMatchObject({ reason: 'target_changed' });
  expect(calls.some(c => c.args[0] === 'paste-buffer')).toBe(false);
  expect(calls.some(c => c.args[0] === 'delete-buffer')).toBe(changeAt === 3);
 }
});
it('distinguishes failures before and after attempted paste without retries',async () => {
 for (const command of ['load-buffer','paste-buffer','send-keys']) {
  const { adapter,calls } = setup(async args => { if (args[0] === command) throw new TmuxError('timeout'); return undefined; });
  expect((await adapter.sendInstruction('hello')).outcome).toBe(command === 'load-buffer' ? 'rejected' : 'unknown');
  expect(calls.filter(c => c.args[0] === command)).toHaveLength(1);
 }
});
it('rejects concurrent input and releases the lock',async () => {
 let release!: () => void; let entered!: () => void;
 const pending = new Promise<void>(r => { release = r; }); const started = new Promise<void>(r => { entered = r; });
 const { adapter } = setup(async args => { if (args[0] === 'paste-buffer') { entered(); await pending; } return undefined; });
 const first = adapter.sendInstruction('first'); await started;
 expect(await adapter.sendInstruction('second')).toMatchObject({ reason: 'busy' });
 expect(await adapter.sendKey('Enter')).toMatchObject({ reason: 'busy' });
 release(); expect((await first).outcome).toBe('sent'); expect((await adapter.sendInstruction('third')).outcome).toBe('sent');
});
it('enforces keys and injected approval detector',async () => {
 const { adapter,calls,runner } = setup();
 for (const key of ['C-c','x','Enter; kill']) expect(await adapter.sendKey(key as OrchestratorKey)).toMatchObject({ reason: 'key_not_allowed' });
 expect(calls).toHaveLength(0); await adapter.sendKey('Escape'); expect(calls[1]!.args).toEqual(['send-keys','-t','%1','Escape']);
 const blocked = new TmuxOrchestratorAdapter(target,{ runner, detector: { detect: (_text,capturedAt) => ({ agentKind: 'codex', question: 'custom', options: [], fingerprint: 'x', capturedAt }) } });
 expect((await blocked.inspectScreen()).inputReady.reason).toBe('approval_pending');
 expect(await blocked.sendInstruction('hello')).toMatchObject({ reason: 'approval_pending' });
});
it('limits captured history plus visible screen to the requested lines',async () => {
 const { adapter } = setup(async args => args[0] === 'capture-pane' ? 'a\nb\nc\nd\n\n' : undefined);
 expect((await adapter.readScreen(2)).text).toBe('c\nd');
});
