import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { apiError } from './errors.js';
export function registerApprovalRoutes(app: Hono, deps: AppDeps) {
 void deps;
 app.post('/api/approvals/respond', c => {
  return apiError(c,501,'not_implemented','Not implemented');
 });
}
