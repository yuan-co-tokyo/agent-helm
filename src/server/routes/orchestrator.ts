import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { apiError } from './errors.js';
export function registerOrchestratorRoutes(app: Hono, deps: AppDeps) {
 void deps;
 app.get('/api/orchestrator/screen', c => {
  return apiError(c,501,'not_implemented','Not implemented');
 });
 app.post('/api/orchestrator/instructions', c => {
  return apiError(c,501,'not_implemented','Not implemented');
 });
}
