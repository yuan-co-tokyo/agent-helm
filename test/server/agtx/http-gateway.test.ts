import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HttpAgtxGateway, checkAgtxVersion } from '../../../src/server/agtx/http-gateway.js';
import { startMockAgtx } from '../../mock-agtx/server.js';
import { TASK_ID, PROJECT_ID, projectFixture } from '../../mock-agtx/fixtures.js';
import type { AgtxKey } from '../../../src/shared/api.js';
import { createLogger } from '../../../src/server/log.js';
describe('HTTP gateway',() => {
 let mock: Awaited<ReturnType<typeof startMockAgtx>>;
 let gateway: HttpAgtxGateway;
 const taskPath = '/api/projects/' + PROJECT_ID + '/tasks/' + TASK_ID;
 beforeEach(async () => {
  mock = await startMockAgtx();
  gateway = new HttpAgtxGateway({ baseUrl: mock.url, projectName: 'agent-helm', timeoutMs: 100 });
 });
 afterEach(async () => { await mock?.close(); });
 it.each(['plain',{ content: '\x1b[31mplain\x1b[0m' },{ text: 'plain' },{ lines: ['plain'] },{ output: 'plain' }])('normalizes pane %j',async value => {
  mock.state.panes[TASK_ID] = value;
  expect(await gateway.readPane(TASK_ID,9999)).toMatchObject({ text: 'plain', lines: 2000 });
  expect(mock.requests.at(-1)?.path).toContain('?lines=2000');
 });
 it('retains internal style evidence while stripping display ANSI', async () => {
  mock.state.panes[TASK_ID] = { text: '› \x1b[90mplaceholder\x1b[0m' };
  expect(await gateway.readPane(TASK_ID)).toMatchObject({ text:'› placeholder',inputText:'› ' });
 });
 it('handles missing pane and malformed pane',async () => {
  delete mock.state.panes[TASK_ID];
  await expect(gateway.readPane(TASK_ID)).rejects.toMatchObject({ kind: 'not_found' });
  expect(gateway.cachedProject).toBeNull();
  mock.state.panes[TASK_ID] = { unexpected: 'text' };
  await expect(gateway.readPane(TASK_ID)).rejects.toMatchObject({ kind: 'bad_response' });
 });
 it('sends exactly key, never text/action/CRUD; rejects conflict',async () => {
  expect(await gateway.sendKey(TASK_ID,'y')).toEqual({ outcome: 'sent' });
  expect(mock.requests.at(-1)).toMatchObject({ method: 'POST', path: taskPath + '/input', body: { key: 'y' } });
  mock.state.tasks[0]!.status = 'done';
  expect(await gateway.sendKey(TASK_ID,'n')).toEqual({ outcome: 'rejected', reason: 'conflict' });
  expect(mock.requests.every(r => r.method === 'GET' || (r.method === 'POST' && r.path.endsWith('/input')))).toBe(true);
 });
 it('does not retry ambiguous input timeouts',async () => {
  mock.state.overrides['POST ' + taskPath + '/input'] = { delayMs: 500, body: { ok: true } };
  expect(await gateway.sendKey(TASK_ID,'Enter')).toMatchObject({ outcome: 'unknown', reason: 'timeout' });
  expect(mock.requests.filter(r => r.method === 'POST')).toHaveLength(1);
 });
 it('normalizes read timeouts',async () => {
  mock.state.overrides['GET /api/health'] = { delayMs: 500, body: {} };
  await expect(gateway.getHealth()).rejects.toMatchObject({ kind: 'timeout' });
 });
 it.each([400,404,409,500,503])('handles input status %s without retry',async status => {
  mock.state.overrides['POST ' + taskPath + '/input'] = { status, body: { error: 'sensitive upstream text' } };
  expect(await gateway.sendKey(TASK_ID,'y')).toMatchObject({ outcome: status < 500 ? 'rejected' : 'unknown' });
  expect(mock.requests.filter(r => r.method === 'POST')).toHaveLength(1);
 });
 it('treats unreadable success as unknown',async () => {
  mock.state.overrides['POST ' + taskPath + '/input'] = { raw: '{broken' };
  expect(await gateway.sendKey(TASK_ID,'y')).toEqual({ outcome: 'unknown', reason: 'bad_response' });
  expect(mock.requests.filter(r => r.method === 'POST')).toHaveLength(1);
 });
 it.each([
  [{delivered:true,extra:1},'sent'], [{delivered:false},'rejected'],
  [{ok:true},'unknown'], [{},'unknown'], [{delivered:'true'},'unknown']
 ])('interprets delivery response %j once',async (body,outcome)=> {
  mock.state.overrides['POST ' + taskPath + '/input'] = {body};
  expect(await gateway.sendKey(TASK_ID,'1')).toEqual(outcome==='sent' ? {outcome} : {outcome,reason:outcome==='rejected' ? 'not_delivered' : 'bad_response'});
  expect(mock.requests.filter(r=>r.method==='POST')).toHaveLength(1);
 });
 it('treats an empty success body as unknown',async ()=> {
  mock.state.overrides['POST ' + taskPath + '/input'] = {raw:''};
  expect(await gateway.sendKey(TASK_ID,'1')).toEqual({outcome:'unknown',reason:'bad_response'});
  expect(mock.requests.filter(r=>r.method==='POST')).toHaveLength(1);
 });
 it('never calls HTTP for invalid keys or IDs',async () => {
  for (const key of ['C-c','a','x']) expect(await gateway.sendKey(TASK_ID,key as AgtxKey)).toMatchObject({ outcome: 'rejected' });
  await expect(gateway.getTask('../')).rejects.toMatchObject({ kind: 'not_found' });
  await expect(gateway.sendKey('bad','y')).rejects.toMatchObject({ kind: 'not_found' });
  expect(mock.requests).toHaveLength(0);
 });
 it('distinguishes missing and ambiguous project names',async () => {
  mock.state.projects = [];
  await expect(gateway.resolveProject()).rejects.toMatchObject({ kind: 'project_not_found' });
  mock.state.projects = [projectFixture,{ ...projectFixture, id: TASK_ID }];
  await expect(gateway.resolveProject()).rejects.toMatchObject({ kind: 'project_ambiguous' });
 });
 it('uses only resolved project UUID and refreshes cache after TTL',async () => {
  let now = 1000;
  gateway = new HttpAgtxGateway({ baseUrl: mock.url, projectName: 'agent-helm', timeoutMs: 500, now: () => now });
  await gateway.getTask(TASK_ID); await gateway.listTasks();
  expect(mock.requests.filter(r => r.path === '/api/projects')).toHaveLength(1);
  now += 60000; await gateway.listTasks();
  expect(mock.requests.filter(r => r.path === '/api/projects')).toHaveLength(2);
  expect(mock.requests.some(r => r.path.includes('/projects/agent-helm/'))).toBe(false);
 });
 it.each([{ raw: '{bad' },{ body: {} },{ body: { version: 123 } }])('rejects invalid health %j',async override => {
  mock.state.overrides['GET /api/health'] = override;
  await expect(gateway.getHealth()).rejects.toMatchObject({ kind: 'bad_response' });
 });
 it('rejects missing task fields and tolerates new phase status',async () => {
  mock.state.tasks = [{ id: TASK_ID }];
  await expect(gateway.listTasks()).rejects.toMatchObject({ kind: 'bad_response' });
  mock.state.tasks = [{ id: TASK_ID, title: 'new', status: 'running', phase_status: 'future', extra: true }];
  expect(await gateway.listTasks()).toMatchObject([{ phaseStatus: null }]);
 });
 it('does not follow redirects',async () => {
  let calls = 0;
  gateway = new HttpAgtxGateway({ baseUrl: mock.url, projectName: 'agent-helm', timeoutMs: 500, fetch: async (_url,init) => {
   calls++; expect(init?.redirect).toBe('error'); throw new TypeError('fetch failed');
  } });
  await expect(gateway.getHealth()).rejects.toMatchObject({ kind: 'unreachable' });
  expect(calls).toBe(1);
 });
 it('warns on version mismatch without failing health',async () => {
  mock.state.health = { version: '9.0.0' };
  const health = await gateway.getHealth();
  const logs: string[] = [];
  expect(checkAgtxVersion(health,createLogger(line => logs.push(line)))).toBe(false);
  expect(logs.join('')).toContain('agtx_version_mismatch');
 });
});
it('normalizes refused connections and never retries input',async () => {
 const mock = await startMockAgtx();
 const gateway = new HttpAgtxGateway({ baseUrl: mock.url, projectName: 'agent-helm', timeoutMs: 500 });
 await gateway.resolveProject();
 await mock.close();
 await expect(gateway.getHealth()).rejects.toMatchObject({ kind: 'unreachable' });
 expect(await gateway.sendKey(TASK_ID,'y')).toEqual({ outcome: 'unknown', reason: 'unreachable' });
});

it('binds identical task IDs to the selected project UUID and detects removal', async () => {
 const mock = await startMockAgtx({ multiProject: true });
 const id = '33333333-3333-4333-8333-333333333333';
 const gateway = new HttpAgtxGateway({ baseUrl: mock.url, projectId: id, timeoutMs: 500 });
 try {
  expect((await gateway.getTask(TASK_ID)).title).toBe('Playground task');
  expect(await gateway.sendKey(TASK_ID,'1')).toMatchObject({ outcome: 'sent' });
  expect(mock.requests.at(-1)?.path).toBe(`/api/projects/${id}/tasks/${TASK_ID}/input`);
  mock.state.projects = [projectFixture];
  expect(await gateway.sendKey(TASK_ID,'1')).toMatchObject({ outcome: 'rejected', reason: 'project_not_found' });
  expect(mock.requests.filter(r => r.method === 'POST')).toHaveLength(1);
 } finally { await mock.close(); }
});
