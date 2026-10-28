import { expect, it } from 'vitest';
import { GatewayError } from '../../src/server/agtx/types.js';
import { headers, makeApp } from './helpers.js';
import { task } from './status/fixtures.js';
it('returns normalized state and task detail', async () => {
 const { app, gateway } = makeApp(); gateway.setTasks([task()]); gateway.setPane(task().id, 'output');
 const state = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/state', { headers }); expect(state.status).toBe(200);
 expect(await state.json()).toMatchObject({ agtx: { reachable: true }, tasks: [{ displayState: 'running' }], attention: [] });
 const detail = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/tasks/' + task().id, { headers }); expect(detail.status).toBe(200);
 expect(await detail.json()).toMatchObject({ description: 'Foundation task', pane: { text: 'output' }, pr: { state: 'none' }, testResult: { status: 'not_available', source: 'pane' } });
});
it.each([
 ['unreachable', 502, 'agtx_unreachable'], ['timeout', 504, 'agtx_timeout'],
 ['project_not_found', 503, 'agtx_project_not_found'], ['project_ambiguous', 503, 'agtx_project_ambiguous'], ['bad_response', 502, 'agtx_bad_response']
] as const)('preserves %s errors in state and detail', async (kind, status, code) => {
 const { app, gateway } = makeApp();
 for (const path of ['/api/projects/11111111-1111-4111-8111-111111111111/state', '/api/projects/11111111-1111-4111-8111-111111111111/tasks/' + task().id]) {
  gateway.failNext('listTasks', new GatewayError(kind)); const response = await app.request(path, { headers });
  expect(response.status).toBe(status); expect(await response.json()).toMatchObject({ error: { code } });
 }
});
it.each(['project_not_found','project_ambiguous'] as const)('retains cached state for %s while health stays reachable', async kind => {
 const { app, gateway } = makeApp(); gateway.setTasks([task()]); await app.request('/api/projects/11111111-1111-4111-8111-111111111111/state', { headers });
 gateway.failNext('listTasks', new GatewayError(kind)); const response = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/state', { headers });
 expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ agtx: { reachable: true, error: { code: 'agtx_' + kind } }, tasks: [{ displayState: 'disconnected' }] });
});
it('validates membership and returns pane errors without failing detail', async () => {
 const { app, gateway } = makeApp();
 expect((await app.request('/api/projects/11111111-1111-4111-8111-111111111111/tasks/invalid', { headers })).status).toBe(400);
 const missing = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/tasks/' + task().id, { headers }); expect(missing.status).toBe(404);
 expect(await missing.json()).toMatchObject({ error: { code: 'not_found' } });
 gateway.setTasks([task()]); const response = await app.request('/api/projects/11111111-1111-4111-8111-111111111111/tasks/' + task().id, { headers });
 expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ pane: null, paneError: { code: 'not_found' } });
});
