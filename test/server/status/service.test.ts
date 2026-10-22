import { expect, it, vi } from 'vitest';
import { MockAgtxGateway } from '../../../src/server/agtx/mock-gateway.js';
import { GatewayError } from '../../../src/server/agtx/types.js';
import { MockOrchestratorAdapter } from '../../../src/server/orchestrator/mock-adapter.js';
import { StatusService, StateUnavailableError } from '../../../src/server/status/service.js';
import { task, prompt } from './fixtures.js';
function setup() {
 const gateway = new MockAgtxGateway(); gateway.setTasks([task()]); gateway.setPane(task().id, 'Allow?');
 const orchestrator = new MockOrchestratorAdapter(); const detect = vi.fn().mockReturnValue(prompt);
 let now = 0;
 const service = new StatusService({ gateway, orchestrator, detector: { detect }, now: () => now,
  pr: { async lookup(url, number) { return { url, number, state: 'none', fetchedAt: null }; } } });
 return { gateway, orchestrator, detect, service, setTime: (value: number) => { now = value; } };
}
it('replaces obsolete list phase with current detail', async () => {
 const { gateway, service } = setup();
 vi.spyOn(gateway, 'listTasks').mockResolvedValue([task({ phaseStatus: 'exited', phaseAgeSecs: 691 })]);
 gateway.setTasks([task({ phaseStatus: 'ready', phaseAgeSecs: 0 })]);
 expect((await service.getState()).tasks[0]?.displayState).toBe('phase_done');
});
it.each(['planning','running','review'] as const)('detects exited and null approval in %s, in both APIs', async status => {
 for (const phaseStatus of ['exited', null] as const) {
  const { gateway, service, detect } = setup();
  gateway.setTasks([task({ status, phaseStatus, agentState: 'ended' })]);
  expect((await service.getState()).tasks[0]?.displayState).toBe('approval');
  expect((await service.getTaskDetail(task().id)).displayState).toBe('approval');
  expect(detect).toHaveBeenCalledTimes(2);
  detect.mockReturnValue(null);
  const expected = phaseStatus === 'exited' && status !== 'review' ? 'error' : 'unknown';
  expect((await service.getState()).tasks[0]?.displayState).toBe(expected);
  expect((await service.getTaskDetail(task().id)).displayState).toBe(expected);
 }
});
it('detects blocked approval and preserves blocked when detection fails', async () => {
 const { gateway, service, detect } = setup(); gateway.setTasks([task({ phaseStatus: 'blocked' })]);
 expect((await service.getState()).tasks[0]?.displayState).toBe('approval');
 detect.mockReturnValue(null); expect((await service.getState()).tasks[0]?.displayState).toBe('blocked');
 detect.mockImplementation(() => { throw new Error(); }); expect((await service.getState()).tasks[0]?.displayState).toBe('blocked');
});
it('skips pane work without a session or for working tasks', async () => {
 const { gateway, service } = setup(); const pane = vi.spyOn(gateway, 'readPane');
 await service.getState(); gateway.setTasks([task({ phaseStatus: 'blocked', sessionName: null })]);
 await service.getState(); expect(pane).not.toHaveBeenCalled();
});
it('retains last successful tasks, attention and timestamp on disconnect', async () => {
 const { gateway, service, setTime } = setup(); gateway.setTasks([task({ phaseStatus: 'blocked' })]);
 const first = await service.getState(); setTime(1000);
 gateway.failNext('getHealth', new GatewayError('unreachable')); gateway.failNext('listTasks', new GatewayError('unreachable'));
 const next = await service.getState();
 expect(next).toMatchObject({ fetchedAt: first.fetchedAt, attention: first.attention, agtx: { reachable: false, checkedAt: new Date(1000).toISOString() } });
 expect(next.tasks[0]).toMatchObject({ id: task().id, displayState: 'disconnected', attentionReason: 'Allow?' });
});
it('fails initially, shares concurrent requests and isolates orchestrator errors', async () => {
 const { gateway, service, orchestrator } = setup(); gateway.failNext('listTasks', new GatewayError('timeout'));
 await expect(service.getState()).rejects.toBeInstanceOf(StateUnavailableError);
 const list = vi.spyOn(gateway, 'listTasks'); vi.spyOn(orchestrator, 'getStatus').mockRejectedValue(new Error());
 const [a,b] = await Promise.all([service.getState(), service.getState()]);
 expect(list).toHaveBeenCalledTimes(1); expect(a).toEqual(b); expect(a.orchestrator.state).toBe('error');
});
it('limits gateway detail concurrency to four', async () => {
 const { gateway, service } = setup();
 gateway.setTasks(Array.from({ length: 10 }, (_, i) => task({ id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, phaseStatus: 'blocked' })));
 const original = gateway.getTask.bind(gateway); let pending = 0; let peak = 0;
 vi.spyOn(gateway, 'getTask').mockImplementation(async id => {
  pending++; peak = Math.max(peak, pending); await Promise.resolve(); const result = await original(id); pending--; return result;
 });
 expect((await service.getState()).tasks).toHaveLength(10); expect(peak).toBe(4);
});
it('only supplies the last forty lines to detail approval detection', async () => {
 const { gateway, service, detect } = setup(); gateway.setTasks([task({ phaseStatus: null })]);
 gateway.setPane(task().id, Array.from({ length: 200 }, (_, i) => String(i)).join('\n'));
 const detail = await service.getTaskDetail(task().id);
 expect(detail.pane?.lines).toBe(200); expect(detect.mock.calls[0]?.[0].split('\n')).toHaveLength(40);
 expect(detect.mock.calls[0]?.[0].split('\n')[0]).toBe('160');
});

it('does not retain a connected TUI after health fails',async ()=> {
 const {gateway,service} = setup();
 expect((await service.getState()).agtx.tuiConnected).toBe(true);
 gateway.failNext('getHealth',new GatewayError('unreachable'));
 expect((await service.getState()).agtx).toMatchObject({reachable:false,tuiConnected:null});
});
it.each(['codex','claude',null].flatMap(agent => [false,true].map(nonempty => ({agent,nonempty}))))('classifies exited input $agent / $nonempty in list and detail',async ({agent,nonempty})=> {
 const {gateway,service,detect} = setup(); detect.mockReturnValue(null);
 gateway.setTasks([task({agent,phaseStatus:'exited'})]);
 gateway.setPane(task().id,(agent==='claude' ? '❯ ' : '› ') + (nonempty ? 'Ask anything' : ''));
 const expected = agent ? (nonempty ? 'input_pending' : 'awaiting_input') : 'error';
 const state = await service.getState(); expect(state.tasks[0]?.displayState).toBe(expected);
 expect((await service.getTaskDetail(task().id)).displayState).toBe(expected);
 if (agent) expect(state.attention.map(item => item.kind)).toEqual(nonempty ? ['input'] : []);
 gateway.failNext('readPane',new GatewayError('timeout'));
 expect((await service.getState()).tasks[0]?.displayState).toBe('error');
 gateway.failNext('readPane',new GatewayError('timeout'));
 expect((await service.getTaskDetail(task().id)).displayState).toBe('error');
});

it.each([true,false])('ignores stale detail health after failure: %s',async tuiConnected => {
 const {gateway,service} = setup();
 gateway.setHealth({...gateway.health,tuiConnected});
 expect((await service.getTaskDetail(task().id)).displayState).toBe(tuiConnected ? 'running' : 'stale');
 gateway.failNext('getHealth',new GatewayError('unreachable'));
 const detail = await service.getTaskDetail(task().id);
 expect(detail.displayState).toBe('running');
 expect(detail.attentionReason).toBeNull();
 expect(gateway.lastHealth?.tuiConnected).toBe(tuiConnected);
});
