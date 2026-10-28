import { expect, it } from 'vitest';
import { loadConfig } from '../../../src/server/config.js';
import { resolveOrchestratorTarget, UnresolvedOrchestratorAdapter } from '../../../src/server/projects/target.js';
const config = loadConfig({ env: {}, readFile: () => '{"agtx":{}}' });
const project = (name: string, id = name) => ({ id, name, path: null });
it('uses exact names, normalizes tmux dots/colons and refuses to guess non-ASCII names', () => {
 for (const [name,expected] of [['demo','demo'],['a.b','a_b'],['a:b','a_b']]) expect(resolveOrchestratorTarget(project(name!),[],config)).toEqual({ target: { socket: 'agtx', session: expected, window: 'orchestrator' } });
 expect(resolveOrchestratorTarget(project('日本語'),[],config).unresolved).toBe('session_unresolved');
});
it('rejects every colliding target and permits an explicit override', () => {
 const all = [project('a.b'),project('a_b')];
 for (const p of all) expect(resolveOrchestratorTarget(p,all,config).unresolved).toBe('target_collision');
 const overridden = { ...config, orchestrators: { 'a.b': { session: 'other', tmuxSocket: 'test', window: 'work' } } };
 for (const p of all) expect(resolveOrchestratorTarget(p,all,overridden).unresolved).toBeUndefined();
 expect(resolveOrchestratorTarget(all[0]!,all,overridden).target).toEqual({ socket: 'test', session: 'other', window: 'work' });
});
it('prioritizes overrides over a legacy fixed session', () => {
 const p = project('demo');
 const fixed = { ...config, agtx: { ...config.agtx, projectName: 'demo' }, orchestrator: { ...config.orchestrator, session: 'legacy' } };
 expect(resolveOrchestratorTarget(p,[p],fixed).target.session).toBe('legacy');
 expect(resolveOrchestratorTarget(p,[p],{ ...fixed, orchestrators: { demo: { session: 'override' } } }).target.session).toBe('override');
});
it('never reads or sends for unresolved targets', async () => {
 const adapter = new UnresolvedOrchestratorAdapter({ socket: 'agtx', session: '日本語', window: 'orchestrator' },'session_unresolved');
 expect(await adapter.getStatus()).toMatchObject({ state: 'not_found', reason: 'session_unresolved' });
 await expect(adapter.readScreen()).rejects.toMatchObject({ kind: 'not_found' });
 await expect(adapter.inspectScreen()).rejects.toMatchObject({ kind: 'not_found' });
 expect(await adapter.sendInstruction()).toEqual({ outcome: 'rejected', reason: 'session_unresolved' });
 expect(await adapter.sendKey()).toEqual({ outcome: 'rejected', reason: 'session_unresolved' });
});
