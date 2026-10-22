import { describe, expect, it } from 'vitest';
import { headers, makeApp } from './helpers.js';
describe('security',() => {
 it.each(['evil.example','127.0.0.1:9999',''])('rejects Host %s on API and static paths',async host => {
  const { app } = makeApp();
  for (const path of ['/api/session','/asset.js']) expect((await app.request(path,{ headers: host ? { host } : {} })).status).toBe(421);
 });
 it.each([
  ['origin',undefined,403,'forbidden_origin'], ['origin','http://evil.example',403,'forbidden_origin'],
  ['origin','http://localhost:8790',403,'forbidden_origin'],
  ['x-helm-csrf',undefined,403,'csrf_invalid'], ['x-helm-csrf','wrong',403,'csrf_invalid'],
  ['content-type','text/plain',415,'unsupported_media_type'], ['content-type','application/x-www-form-urlencoded',415,'unsupported_media_type'],
  ['content-type',undefined,415,'unsupported_media_type']
 ] as const)('rejects %s=%s',async (key,value,status,code) => {
  const requestHeaders: Record<string,string> = { ...headers };
  if (value === undefined) delete requestHeaders[key]; else requestHeaders[key] = value;
  const result = await makeApp().app.request('/api/approvals/respond',{ method: 'POST', headers: requestHeaders });
  expect(result.status).toBe(status); expect(await result.json()).toMatchObject({ error: { code } });
 });
 it('allows valid JSON POST; protects all mutation verbs',async () => {
  const { app } = makeApp();
  expect((await app.request('/api/approvals/respond',{ method: 'POST', headers: { ...headers, 'content-type': 'Application/JSON; charset=utf-8' }, body: '{}' })).status).toBe(400);
  for (const method of ['OPTIONS','PUT','DELETE','PATCH']) expect((await app.request('/api/session',{ method, headers: { host: headers.host } })).status).toBe(403);
 });
 it('accepts matching localhost and IPv6 origins',async () => {
  for (const host of ['localhost:8790','[::1]:8790']) expect((await makeApp().app.request('/api/approvals/respond',{ method: 'POST', headers: { ...headers, host, origin: 'http://' + host }, body: '{}' })).status).toBe(400);
 });
 it('rejects oversized body without trusting content-length',async () => {
  const result = await makeApp().app.request('/api/approvals/respond',{ method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(65536) }) });
  expect(result.status).toBe(413);
 });
 it('sets security headers even on errors and never enables CORS',async () => {
  const result = await makeApp().app.request('/api/session',{ headers: { host: 'evil.example' } });
  expect(result.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
  expect(result.headers.get('x-frame-options')).toBe('DENY');
  expect(result.headers.get('x-content-type-options')).toBe('nosniff');
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(result.headers.has('access-control-allow-origin')).toBe(false);
 });
 it('does not log body, query or CSRF',async () => {
  const { app, logs } = makeApp();
  await app.request('/api/approvals/respond?secret=query-secret',{ method: 'POST', headers, body: JSON.stringify({ text: 'private-pane-and-instruction' }) });
  const log = logs.join('');
  for (const secret of ['query-secret','test-csrf-secret','private-pane-and-instruction']) expect(log).not.toContain(secret);
  expect(log).toContain('/api/approvals/respond');
 });
});
