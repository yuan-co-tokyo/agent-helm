import { expect, it } from 'vitest';
import { createApiClient } from '../../src/web/api/client.js';
it('attaches CSRF and JSON headers; refreshes once without replaying POST',async () => {
 const calls: { path: string; init?: RequestInit }[] = [];
 const client = createApiClient(async (url,init) => {
  calls.push({ path: String(url), init });
  if (url === '/api/session') return Response.json({ csrfToken: 'token' });
  return Response.json({ error: { code: 'csrf_invalid', message: 'invalid' } },{ status: 403 });
 });
 await expect(client.apiPost('/api/approvals/respond',{ key: 'y' })).rejects.toMatchObject({ status: 403, code: 'csrf_invalid' });
 expect(calls.map(c => c.path)).toEqual(['/api/session','/api/approvals/respond','/api/session']);
 expect(calls[1]?.init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json', 'x-helm-csrf': 'token' }, credentials: 'same-origin', cache: 'no-store' });
});
it('does not refresh for unrelated forbidden errors',async () => {
 let calls = 0;
 const client = createApiClient(async url => {
  calls++;
  return url === '/api/session' ? Response.json({ csrfToken: 'token' }) : Response.json({ error: { code: 'forbidden_origin' } },{ status: 403 });
 });
 await expect(client.apiPost('/api/test',{})).rejects.toMatchObject({ code: 'forbidden_origin' });
 expect(calls).toBe(2);
});
it('normalizes network errors and never retries unknown mutations',async () => {
 let posts = 0;
 const client = createApiClient(async url => {
  if (url === '/api/session') return Response.json({ csrfToken: 'token' });
  posts++; throw new TypeError('private network details');
 });
 await expect(client.apiPost('/api/test',{})).rejects.toMatchObject({ status: 0, code: 'network' });
 expect(posts).toBe(1);
});
it('rejects foreign request URLs before fetch',async () => {
 const client = createApiClient(async () => { throw new Error('must not fetch'); });
 await expect(client.apiGet('https://example.com')).rejects.toMatchObject({ code: 'bad_request' });
});
