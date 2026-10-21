import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
export interface Logger {
 info(event: string, fields?: Record<string, unknown>): void;
 warn(event: string, fields?: Record<string, unknown>): void;
 error(event: string, fields?: Record<string, unknown>): void;
}
export function createLogger(sink: (line: string) => void = line => { process.stderr.write(line + '\n'); }): Logger {
 const emit = (level: string) => (event: string, fields: Record<string, unknown> = {}) => sink(JSON.stringify({ ...fields, level, event }));
 return { info: emit('info'), warn: emit('warn'), error: emit('error') };
}
export function redact(text: string) { return { len: text.length, sha256: createHash('sha256').update(text).digest('hex').slice(0,12) }; }
export function requestLogger(logger: Logger): MiddlewareHandler {
 return async (c, next) => {
  const start = performance.now();
  await next();
  logger.info('request', { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) });
 };
}
