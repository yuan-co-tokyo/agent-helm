import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { createApp } from '../../src/server/app.js';
import { MockAgtxDirectory } from '../../src/server/agtx/directory.js';
import { MockAgtxGateway } from '../../src/server/agtx/mock-gateway.js';
import { MockOrchestratorAdapter } from '../../src/server/orchestrator/mock-adapter.js';
import { ProjectRegistry } from '../../src/server/projects/registry.js';
import { loadConfig } from '../../src/server/config.js';
import { createLogger } from '../../src/server/log.js';
import { createApprovalDetector } from '../../src/server/approval/adapter.js';
import { detectApproval } from '../../src/server/approval/index.js';
import { detailSchema } from '../../src/server/agtx/schemas.js';
import { headers } from './helpers.js';
import { PROJECT_ID as A, PROJECT_B_ID as B, TASK_ID, taskFixture } from '../mock-agtx/fixtures.js';
const pane = readFileSync('test/fixtures/panes/codex-exec-approval.txt','utf8');
export function setup(names = ['agent-helm','agtx-playground']) {
 let now = 0;
 const gateways = [new MockAgtxGateway(),new MockAgtxGateway()];
 const adapters = [new MockOrchestratorAdapter(),new MockOrchestratorAdapter()];
 gateways.forEach((g,i) => { g.project = { id: i ? B : A, name: names[i]!, path: '/deleted/private/project', tuiConnected: !i }; g.tasks = [detailSchema.parse({ ...taskFixture, title: i ? 'Playground task' : taskFixture.title, agent_state: 'exited', phase_status: null })]; g.setPane(TASK_ID,i ? pane.replace('pnpm test','pnpm build') : pane); });
 const directory = new MockAgtxDirectory(gateways.map(g => g.project),() => gateways[0]!.getHealth());
 const config = loadConfig({ env: {}, readFile: () => '{"agtx":{}}' });
 const orchestratorFactory = vi.fn((_target,project) => adapters[project.id === A ? 0 : 1]!);
 const registry = new ProjectRegistry({ config, directory, now: () => now, gatewayFactory: project => gateways[project.id === A ? 0 : 1]!, orchestratorFactory, approvalDetector: createApprovalDetector('task') });
 const app = createApp({ config, registry, csrfToken: 'test-csrf-secret', appVersion: '1', logger: createLogger(() => {}), approval: { settleMs: 0 } });
 const body = (id = A) => ({ projectId: id, target: { kind: 'task', taskId: TASK_ID }, fingerprint: detectApproval(gateways[id === A ? 0 : 1]!.panes.get(TASK_ID)!,{ capturedAt: '' })!.fingerprint, key: '1', requestId: randomUUID() });
 const post = (id: string, body: object, suffix = 'approvals/respond') => app.request(`/api/projects/${id}/${suffix}`,{ method: 'POST', headers, body: JSON.stringify(body) });
 return { app, registry, directory, gateways, adapters, body, post, orchestratorFactory, advance: () => { now += 5001; } };
}
it('compares fingerprints at the destination, even when task IDs match', async () => {
 const ctx = setup();
 const response = await ctx.post(B,{ ...ctx.body(A), projectId: B });
 expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: 'stale' } });
 expect(ctx.gateways.map(g => g.sentKeys.length)).toEqual([0,0]);
});
it('sends only to the selected project and scopes request IDs independently', async () => {
 const ctx = setup(), requestId = randomUUID();
 for (const id of [B,A]) {
  const body = { ...ctx.body(id), requestId };
  expect((await ctx.post(id,body)).status).toBe(200);
  expect((await ctx.post(id,body)).status).toBe(200);
 }
 expect(ctx.gateways.map(g => g.sentKeys.length)).toEqual([1,1]);
 expect((await ctx.post(A,{ ...ctx.body(A), requestId, target: { kind: 'orchestrator' } })).status).toBe(409);
 expect((await ctx.post(A,{ ...ctx.body(A), requestId, key: '2' })).status).toBe(409);
});
it('rejects missing/mismatched IDs and unknown projects before sending', async () => {
 const ctx = setup();
 expect((await ctx.post(A,ctx.body(B))).status).toBe(400);
 expect((await ctx.post(A,{ text: 'hello', requestId: randomUUID() },'orchestrator/instructions')).status).toBe(400);
 expect((await ctx.post(randomUUID(),ctx.body())).status).toBe(404);
 expect((await ctx.post('invalid',ctx.body())).status).toBe(400);
 expect(ctx.gateways.map(g => g.sentKeys.length)).toEqual([0,0]);
});
it('holds task locks per project while another project is sending', async () => {
 const ctx = setup(); let release!: () => void, entered!: () => void;
 const started = new Promise<void>(r => { entered = r; });
 vi.spyOn(ctx.gateways[0]!,'sendKey').mockImplementation(async () => { entered(); await new Promise<void>(r => { release = r; }); return { outcome: 'sent' }; });
 const pending = ctx.post(A,ctx.body(A)); await started;
 expect((await ctx.post(B,ctx.body(B))).status).toBe(200);
 expect(ctx.gateways[1]!.sentKeys).toHaveLength(1);
 expect((await ctx.post(A,ctx.body(A))).status).toBe(409);
 release(); expect((await pending).status).toBe(200);
});
it('routes instructions to the selected adapter only', async () => {
 const ctx = setup(); const a = vi.spyOn(ctx.adapters[0]!,'sendInstruction'), b = vi.spyOn(ctx.adapters[1]!,'sendInstruction');
 const body = { projectId: B, text: 'hello', requestId: randomUUID() };
 expect((await ctx.post(B,body,'orchestrator/instructions')).status).toBe(200);
 await ctx.post(B,body,'orchestrator/instructions');
 expect(a).not.toHaveBeenCalled(); expect(b).toHaveBeenCalledExactlyOnceWith('hello');
});
it.each([['a.b','a_b','target_collision'],['日本語','other','session_unresolved']])('rejects unresolved targets %s / %s without constructing tmux adapters', async (a,b,reason) => {
 const ctx = setup([a,b]);
 const ids = reason === 'target_collision' ? [A,B] : [A];
 for (const id of ids) expect(await (await ctx.post(id,{ projectId: id, text: 'hello', requestId: randomUUID() },'orchestrator/instructions')).json()).toMatchObject({ outcome: 'rejected', reason });
 expect(ctx.orchestratorFactory).not.toHaveBeenCalled();
});
it('rejects a removed project after the directory cache expires', async () => {
 const ctx = setup(); await ctx.registry.get(B); ctx.directory.projects = [ctx.gateways[0]!.project]; ctx.advance();
 expect((await ctx.post(B,ctx.body(B))).status).toBe(404);
 expect(ctx.gateways[1]!.sentKeys).toHaveLength(0);
});
it('lists offline projects without exposing full paths or losing healthy entries', async () => {
 const ctx = setup();
 const response = await ctx.app.request('/api/projects',{ headers });
 const result = await response.json();
 expect(result.projects).toHaveLength(2);
 expect(result.projects[0]).toMatchObject({ id: A, tuiConnected: true, pathTail: 'project', approvalCount: 1 });
 expect(result.projects[1]).toMatchObject({ id: B, tuiConnected: false });
 expect(JSON.stringify(result)).not.toContain('/deleted/private');
});

it('keeps healthy cards when another project fails', async () => {
 const ctx = setup();
 vi.spyOn(ctx.gateways[1]!,'listTasks').mockRejectedValue(new Error('missing path'));
 const response = await ctx.app.request('/api/projects',{ headers });
 expect(response.status).toBe(200);
 const { projects } = await response.json();
 expect(projects[0].approvalCount).toBe(1);
 expect(projects[1]).toMatchObject({ id: B, tuiConnected: false, attentionCount: null, approvalCount: null, error: { code: 'internal' } });
});
it('uses per-project TUI status in state and task detail', async () => {
 const ctx = setup();
 const state = await (await ctx.app.request(`/api/projects/${B}/state`,{ headers })).json();
 expect(state.agtx.tuiConnected).toBe(false);
 expect(state.project.id).toBe(B);
 const detail = await (await ctx.app.request(`/api/projects/${B}/tasks/${TASK_ID}`,{ headers })).json();
 expect(detail.displayState).toBe('stale');
 expect(detail.attentionReason).toBe('TUI未接続');
});

it('times out only the slow project aggregation after four seconds', async () => {
 const ctx = setup();
 const slow = await ctx.registry.get(B);
 vi.spyOn(slow.statusService,'getState').mockReturnValue(new Promise(() => {}));
 vi.useFakeTimers();
 try {
  const response = ctx.app.request('/api/projects',{ headers });
  await vi.advanceTimersByTimeAsync(4001);
  const result = await (await response).json();
  expect(result.projects[0].approvalCount).toBe(1);
  expect(result.projects[1]).toMatchObject({ id: B, attentionCount: null, error: { code: 'agtx_timeout' } });
 } finally { vi.useRealTimers(); }
});
