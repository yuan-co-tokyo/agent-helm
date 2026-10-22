import type { Hono } from 'hono';
import type { SendResult } from '../../shared/api.js';
import { isUuid } from '../../shared/constants.js';
import type { AppDeps } from '../app.js';
import { clampLines } from '../agtx/schemas.js';
import { OrchestratorError } from '../orchestrator/types.js';
import { validateInstruction } from '../orchestrator/validate.js';
import { RequestCache, RequestConflict } from '../orchestrator/request-cache.js';
import { apiError } from './errors.js';
export function registerOrchestratorRoutes(app: Hono, deps: AppDeps) {
 const cache = new RequestCache<SendResult>();
 app.get('/api/orchestrator/screen',async c => {
  const raw = c.req.query('lines');
  if (raw !== undefined && (!raw.trim() || !Number.isFinite(Number(raw)))) return apiError(c,400,'bad_request','Invalid lines');
  try { return c.json(await deps.orchestrator.inspectScreen(clampLines(raw === undefined ? undefined : Number(raw)))); }
  catch (e) {
   if (e instanceof OrchestratorError && e.kind === 'not_found') return apiError(c,404,'not_found','Orchestrator not found');
   if (e instanceof OrchestratorError && e.kind === 'ambiguous') return apiError(c,409,'conflict','Multiple orchestrator panes');
   return apiError(c,502,'internal','Cannot read orchestrator');
  }
 });
 app.post('/api/orchestrator/instructions',async c => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return apiError(c,400,'bad_request','Invalid JSON'); }
  if (!body || typeof body !== 'object' || !('text' in body) || !('requestId' in body) || typeof body.requestId !== 'string' || !isUuid(body.requestId)) return apiError(c,400,'bad_request','Invalid instruction request');
  const valid = validateInstruction(body.text,deps.config.limits.instructionMaxChars);
  if (!valid.ok) return apiError(c,valid.status,valid.status === 413 ? 'payload_too_large' : 'bad_request',valid.reason);
  const text = body.text as string;
  const requestId = body.requestId.toLowerCase();
  try { return c.json(await cache.run(requestId,text,async () => ({ ...await deps.orchestrator.sendInstruction(text), requestId }))); }
  catch (e) { if (e instanceof RequestConflict) return apiError(c,409,'conflict',e.message); throw e; }
 });
}
