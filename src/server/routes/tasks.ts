import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { apiError } from './errors.js';
import { isUuid } from '../../shared/constants.js';
export function registerTaskRoutes(app: Hono, deps: AppDeps) {
 void deps;
 app.get('/api/tasks/:id', c => {
  if (!isUuid(c.req.param('id'))) return apiError(c,400,'bad_request','Task ID must be a UUID');
  return apiError(c,501,'not_implemented','Not implemented');
 });
}
