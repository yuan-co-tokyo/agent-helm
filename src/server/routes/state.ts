import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { apiError } from './errors.js';
export function registerStateRoutes(app: Hono, deps: AppDeps) {
 void deps;
 app.get('/api/state', c => {
  return apiError(c,501,'not_implemented','Not implemented');
 });
}
