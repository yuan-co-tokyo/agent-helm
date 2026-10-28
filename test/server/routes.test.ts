import { expect, it } from 'vitest';
import { headers, makeApp } from './helpers.js';
it('serves session with nullable caches and later resolved identity',async () => {
 const { app, directory } = makeApp();
 expect(await (await app.request('/api/session',{ headers })).json()).toMatchObject({ csrfToken: 'test-csrf-secret', target: { fixedProjectName: 'agent-helm' }, versions: { agtx: null } });
 await directory.getHealth();
 expect(await (await app.request('/api/session',{ headers })).json()).toMatchObject({ target: { fixedProjectName: 'agent-helm' }, versions: { agtx: '1.0.6' } });
});
it('registers stubs and rejects invalid IDs / unknown API routes',async () => {
 const { app } = makeApp();
 expect((await app.request('/api/projects/11111111-1111-4111-8111-111111111111/tasks/not-a-uuid',{ headers })).status).toBe(400);
 for (const path of ['/api/unknown','/api','/api/state','/api/tasks/x','/api/orchestrator/screen']) {
  const res = await app.request(path,{ headers }); expect(res.status).toBe(404); expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
 }
 expect((await app.request('/',{ headers })).status).toBe(503);
});
