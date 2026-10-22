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
 const result = await response.json(); expect(result).toMatchObject({ requestId: ctx.body.requestId, outcome: 'sent_unconfirmed', after: { text } });
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

it.each(['task','orchestrator'] as const)('never sends terminal selector keys to %s',async kind=> {
 const ctx = setup(kind,readFileSync('test/fixtures/panes/claude-trust.real.txt','utf8'));
 for (const key of ['1','Enter','Down']) {
  const response = await ctx.post({...ctx.body,key,requestId:randomUUID()});
  expect(response.status).toBe(400); expect(await response.json()).toMatchObject({error:{code:'key_not_sendable'}});
 }
 expect((await ctx.post({...ctx.body,fingerprint:'0'.repeat(64),requestId:randomUUID()})).status).toBe(409);
 expect(ctx.gateway.sentKeys).toHaveLength(0); expect(ctx.orchestrator.keys).toHaveLength(0);
});

const trust = readFileSync('test/fixtures/panes/codex-trust.real.txt','utf8');
it.each(['task','orchestrator'] as const)('confirms trust safely on %s and caches both steps',async kind=> {
 for (const key of ['1','2']) {
  const ctx = setup(kind,trust); ctx.body.key = key;
  const onKey = (sent:string)=> {
   const next = sent==='Enter' ? 'Done' : key==='2' ? trust.replace('› 1.','  1.').replace('  2.','› 2.') : trust;
   ctx.gateway.setPane(TASK_ID,next); ctx.orchestrator.text = next;
  };
  ctx.gateway.onKey = (_id,key)=>onKey(key); ctx.orchestrator.onKey = onKey;
  const result = await (await ctx.post()).json();
  expect(result).toMatchObject({outcome:'sent',after:{text:'Done'}});
  expect(await (await ctx.post()).json()).toEqual(result);
  expect(kind==='task' ? ctx.gateway.sentKeys.map(x=>x.key) : ctx.orchestrator.keys).toEqual([key,'Enter']);
 }
});
it.each(['unchanged','changed','read-failed','number-unknown','enter-unknown','enter-rejected','remaining'] as const)('handles trust %s without retry',async mode=> {
 const ctx = setup('task',trust);
 if (mode==='unchanged') ctx.body.key = '2';
 ctx.gateway.onKey = ()=> {
  if (mode==='changed') ctx.gateway.setPane(TASK_ID,'Done');
  if (mode==='read-failed') ctx.gateway.failNext('readPane',new GatewayError('timeout'));
 };
 if (mode==='number-unknown') vi.spyOn(ctx.gateway,'sendKey').mockResolvedValue({outcome:'unknown'});
 if (mode==='enter-unknown' || mode==='enter-rejected') vi.spyOn(ctx.gateway,'sendKey').mockResolvedValueOnce({outcome:'sent'}).mockResolvedValueOnce({outcome:mode==='enter-unknown' ? 'unknown' : 'rejected'});
 const spy = vi.spyOn(ctx.gateway,'sendKey');
 const result = await (await ctx.post()).json();
 expect(result.outcome).toBe(mode==='remaining' ? 'sent_unconfirmed' : mode==='enter-rejected' ? 'rejected' : 'unknown');
 if (mode==='unchanged' || mode==='read-failed') expect(result.reason).toBe('selection_unverified');
 if (mode==='changed') expect(result.reason).toBe('prompt_changed');
 expect(spy.mock.calls.map(x=>x[1])).toEqual(mode.startsWith('enter-') || mode==='remaining' ? ['1','Enter'] : [ctx.body.key]);
 await ctx.post(); expect(spy).toHaveBeenCalledTimes(mode.startsWith('enter-') || mode==='remaining' ? 2 : 1);
});
it.each(['task','orchestrator'] as const)('sends exec keys once without Enter on %s',async kind=> {
 for (const key of ['1','3']) for (const changed of [false,true]) {
  const ctx = setup(kind,readFileSync('test/fixtures/panes/codex-exec-approval.real.txt','utf8')); ctx.body.key = key;
  if (changed) { ctx.gateway.onKey = ()=>ctx.gateway.setPane(TASK_ID,'Done'); ctx.orchestrator.onKey = ()=> { ctx.orchestrator.text='Done'; }; }
  expect(await (await ctx.post()).json()).toMatchObject({outcome:changed ? 'sent' : 'sent_unconfirmed'});
  expect(kind==='task' ? ctx.gateway.sentKeys.map(x=>x.key) : ctx.orchestrator.keys).toEqual([key]);
 }
});
it('marks delivered input unverified if final refresh fails',async ()=> {
 const ctx = setup(); ctx.gateway.onKey = ()=>ctx.gateway.failNext('readPane',new GatewayError('timeout'));
 expect(await (await ctx.post()).json()).toMatchObject({outcome:'sent',reason:'unverified'});
});
