import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { apiError, gatewayErrorToResponse } from './errors.js';
import { GatewayError } from '../agtx/types.js';
import { statusServiceFor, StateUnavailableError } from '../status/service.js';
import { isUuid } from '../../shared/constants.js';
export function registerTaskRoutes(app: Hono, deps: AppDeps) {
 app.get('/api/tasks/:id', async c => {
  if (!isUuid(c.req.param('id'))) return apiError(c,400,'bad_request','Task ID must be a UUID');
  try { return c.json(await statusServiceFor(deps).getTaskDetail(c.req.param('id'))); }
  catch (error) {
   const cause = error instanceof StateUnavailableError ? error.gatewayError : error;
   if (!(cause instanceof GatewayError)) throw error;
   const response = gatewayErrorToResponse(cause);
   return c.json(response.body, response.status);
  }
 });
}
