import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { CSRF_HEADER } from '../shared/constants.js';
export const allowedHosts = (port: number) => new Set(['127.0.0.1:' + port, 'localhost:' + port, '[::1]:' + port]);
export const generateCsrfToken = () => randomBytes(32).toString('base64url');
export function hostGuard(port: number): MiddlewareHandler {
 return async (c,next) => {
  if (!allowedHosts(port).has(c.req.header('host') ?? '')) return c.json({ error: { code: 'invalid_host', message: 'Invalid Host' } },421);
  await next();
 };
}
export function mutationGuard({ port, csrfToken }: { port: number; csrfToken: string }): MiddlewareHandler {
 const limit = bodyLimit({ maxSize: 64 * 1024, onError: c => c.json({ error: { code: 'payload_too_large', message: 'Body exceeds 64 KiB' } },413) });
 return async (c,next) => {
  if (['GET','HEAD'].includes(c.req.method)) return next();
  const host = c.req.header('host') ?? '';
  if (!allowedHosts(port).has(host) || c.req.header('origin') !== 'http://' + host) return c.json({ error: { code: 'forbidden_origin', message: 'Origin must match Host' } },403);
  const token = Buffer.from(c.req.header(CSRF_HEADER) ?? '');
  const expected = Buffer.from(csrfToken);
  if (token.length !== expected.length || !timingSafeEqual(token,expected)) return c.json({ error: { code: 'csrf_invalid', message: 'Invalid CSRF token' } },403);
  if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return c.json({ error: { code: 'unsupported_media_type', message: 'JSON required' } },415);
  return limit(c,next);
 };
}
export function securityHeaders(): MiddlewareHandler {
 return async (c,next) => {
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  c.header('X-Content-Type-Options','nosniff'); c.header('X-Frame-Options','DENY');
  c.header('Referrer-Policy','no-referrer'); c.header('Cross-Origin-Opener-Policy','same-origin');
  if (c.req.path === '/api' || c.req.path.startsWith('/api/')) c.header('Cache-Control','no-store');
  await next();
 };
}
