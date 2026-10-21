import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { makeApp, headers } from './helpers.js';
import { TASK_ID, taskFixture } from '../mock-agtx/fixtures.js';
import { detailSchema } from '../../src/server/agtx/schemas.js';
import { GatewayError } from '../../src/server/agtx/types.js';
import { detectApproval } from '../../src/server/approval/index.js';
import type { ApprovalRespondRequest } from '../../src/shared/api.js';
const text = readFileSync('test/fixtures/panes/codex-exec-approval.txt','utf8');
function setup(kind: 'task'|'orchestrator' = 'task', pane = text) {
 const ctx = makeApp({ approval: { settleMs: 0, sendTimeoutMs: 10 } });
 ctx.gateway.tasks = [detailSchema.parse(taskFixture)]; ctx.gateway.setPane(TASK_ID,pane);
 ctx.orchestrator.status.state = 'running'; ctx.orchestrator.text = pane;
 const body: ApprovalRespondRequest = { target: kind === 'task' ? { kind, taskId: TASK_ID } : { kind }, fingerprint: detectApproval(pane,{ capturedAt: '' })!.fingerprint, key: '1', requestId: randomUUID() };
 const post = (value: unknown = body) => ctx.app.request('/api/approvals/respond',{ method: 'POST', headers, body: JSON.stringify(value) });
 return { ...ctx, body, post };
}
it.each(['task','orchestrator'] as const)('sends once to %s and returns the refreshed pane',async kind => {
 const ctx = setup(kind);
 const response = await ctx.post(); expect(response.status).toBe(200);
 const result = await response.json(); expect(result).toMatchObject({ requestId: ctx.body.requestId, outcome: 'sent', after: { text } });
 expect(await (await ctx.post()).json()).toEqual(result);
 expect(kind === 'task' ? ctx.gateway.sentKeys : ctx.orchestrator.keys).toHaveLength(1);
 expect(ctx.logs.join('')).not.toContain('pnpm test');
});
it('shares an in-flight request and rejects other requests for the same target without caching conflict',async () => {
 const ctx = setup();
 const entered = deferred<void>(); const release = deferred<{ outcome: 'sent' }>();
 const send = vi.spyOn(ctx.gateway,'sendKey').mockImplementation(() => { entered.resolve(undefined); return release.promise; });
 const first = ctx.post(); await entered.promise;
 const duplicate = ctx.post();
 const other = { ...ctx.body, requestId: randomUUID() };
 const conflict = await ctx.post(other); expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ error: { code: 'conflict', message: 'target_busy' } });
 release.resolve({ outcome: 'sent' });
 expect(await (await duplicate).json()).toEqual(await (await first).json()); expect(send).toHaveBeenCalledTimes(1);
 expect((await ctx.post(other)).status).toBe(200); expect(send).toHaveBeenCalledTimes(2);
});
it.each(['missing','done','backlog','no-session','orchestrator'] as const)('returns and caches gone for %s',async mode => {
 const ctx = setup(mode === 'orchestrator' ? 'orchestrator' : 'task');
 if (mode === 'missing') ctx.gateway.tasks = [];
 else if (mode === 'done' || mode === 'backlog') ctx.gateway.tasks[0]!.status = mode;
 else if (mode === 'no-session') ctx.gateway.tasks[0]!.sessionName = null;
 else ctx.orchestrator.status.state = 'not_found';
 const response = await ctx.post(); expect(response.status).toBe(410); expect(await response.json()).toMatchObject({ error: { code: 'gone' } });
 ctx.gateway.tasks = [detailSchema.parse(taskFixture)]; ctx.orchestrator.status.state = 'running';
 expect((await ctx.post()).status).toBe(410); expect(ctx.gateway.sentKeys).toHaveLength(0); expect(ctx.orchestrator.keys).toHaveLength(0);
});
it.each(['fingerprint','disappeared'])('rejects and caches stale %s',async mode => {
 const ctx = setup();
 if (mode === 'fingerprint') ctx.body.fingerprint = '0'.repeat(64); else ctx.gateway.setPane(TASK_ID,'Done');
 const response = await ctx.post(); expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ error: { code: 'stale' } });
 ctx.gateway.setPane(TASK_ID,text); ctx.body.fingerprint = detectApproval(text,{ capturedAt: '' })!.fingerprint;
 expect((await ctx.post()).status).toBe(409); expect(ctx.gateway.sentKeys).toHaveLength(0);
});
it.each(['p','Up','Enter','9'])('rejects keys outside options: %s',async key => {
 const ctx = setup(); ctx.body.key = key;
 const response = await ctx.post(); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: { code: 'bad_request' } }); expect(ctx.gateway.sentKeys).toHaveLength(0);
});
it.each([{}, { key: '' },{ key: 'a'.repeat(17) },{ fingerprint: 'bad' },{ target: { kind: 'task', taskId: 'bad' } },{ requestId: 'bad' }])('validates request body %j',async patch => {
 const ctx = setup(); const response = await ctx.post(Object.keys(patch).length ? { ...ctx.body, ...patch } : {});
 expect(response.status).toBe(400); expect(ctx.gateway.sentKeys).toHaveLength(0);
});
it('rejects malformed JSON',async () => {
 const ctx = setup(); expect((await ctx.app.request('/api/approvals/respond',{ method: 'POST', headers, body: '{' })).status).toBe(400);
});
it.each(['claude-edit-four-options.estimated','generic-yesno'])('rejects unsendable options in %s',async name => {
 const ctx = setup('task',readFileSync('test/fixtures/panes/' + name + '.txt','utf8')); ctx.body.key = name.startsWith('claude') ? '4' : 'y';
 const response = await ctx.post(); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ error: { code: 'key_not_sendable' }, option: { key: ctx.body.key } }); expect(ctx.gateway.sentKeys).toHaveLength(0);
});
it('allows option 4 on the orchestrator',async () => {
 const ctx = setup('orchestrator',readFileSync('test/fixtures/panes/claude-edit-four-options.estimated.txt','utf8')); ctx.body.key = '4';
 expect((await ctx.post()).status).toBe(200); expect(ctx.orchestrator.keys).toEqual(['4']);
});
it.each(['unknown','timeout','error','rejected'] as const)('never retries a send returning %s',async mode => {
 const ctx = setup();
 const send = vi.spyOn(ctx.gateway,'sendKey').mockImplementation(async () => {
  if (mode === 'timeout') return new Promise(() => {});
  if (mode === 'error') throw new Error('private error');
  return { outcome: mode, reason: 'transport' };
 });
 const read = vi.spyOn(ctx.gateway,'readPane');
 const response = await ctx.post(); expect(response.status).toBe(200);
 const result = await response.json(); expect(result).toMatchObject({ outcome: mode === 'rejected' ? 'rejected' : 'unknown', reason: mode === 'timeout' || mode === 'error' ? mode : 'transport' });
 expect(read).toHaveBeenCalledTimes(mode === 'rejected' ? 1 : 2);
 expect(await (await ctx.post()).json()).toEqual(result); expect(send).toHaveBeenCalledTimes(1);
});
it('preserves the outcome when refresh fails',async () => {
 const ctx = setup(); vi.spyOn(ctx.gateway,'sendKey').mockImplementation(async () => { ctx.gateway.failNext('readPane',new GatewayError('timeout')); return { outcome: 'unknown', reason: 'original' }; });
 expect(await (await ctx.post()).json()).toEqual({ requestId: ctx.body.requestId, outcome: 'unknown', reason: 'original' });
});
it('maps and caches gateway errors and releases the target lock',async () => {
 const ctx = setup(); ctx.gateway.failNext('getTask',new GatewayError('unreachable'));
 expect((await ctx.post()).status).toBe(502); expect((await ctx.post()).status).toBe(502);
 expect((await ctx.post({ ...ctx.body, requestId: randomUUID() })).status).toBe(200);
});

function deferred<T>() {
 let resolve!: (value: T | PromiseLike<T>) => void;
 const promise = new Promise<T>(done => { resolve = done; });
 return { promise, resolve };
}
