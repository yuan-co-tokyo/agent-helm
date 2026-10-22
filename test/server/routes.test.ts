import { expect, it } from 'vitest';
import { headers, makeApp } from './helpers.js';
it('serves session with nullable caches and later resolved identity',async () => {
 const { app, gateway } = makeApp();
 expect(await (await app.request('/api/session',{ headers })).json()).toMatchObject({ csrfToken: 'test-csrf-secret', target: { project: { id: null } }, versions: { agtx: null } });
 await gateway.resolveProject(); await gateway.getHealth();
 expect(await (await app.request('/api/session',{ headers })).json()).toMatchObject({ target: { project: { id: gateway.project.id } }, versions: { agtx: '1.0.6' } });
});
it('registers stubs and rejects invalid IDs / unknown API routes',async () => {
 const { app } = makeApp();
 for (const path of ['/api/approvals/respond']) expect((await app.request(path,{ method: 'POST', headers, body: '{}' })).status).toBe(501);
 expect((await app.request('/api/tasks/not-a-uuid',{ headers })).status).toBe(400);
 for (const path of ['/api/unknown','/api']) {
  const res = await app.request(path,{ headers }); expect(res.status).toBe(404); expect(await res.json()).toMatchObject({ error: { code: 'not_found' } });
 }
 expect((await app.request('/',{ headers })).status).toBe(503);
});
