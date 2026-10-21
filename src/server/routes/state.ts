import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import { gatewayErrorToResponse } from './errors.js';
import { GatewayError } from '../agtx/types.js';
import { statusServiceFor, StateUnavailableError } from '../status/service.js';
export function registerStateRoutes(app: Hono, deps: AppDeps) {
 app.get('/api/state', async c => {
  try { return c.json(await statusServiceFor(deps).getState()); }
  catch (error) {
   const cause = error instanceof StateUnavailableError ? error.gatewayError : error;
   if (!(cause instanceof GatewayError)) throw error;
   const response = gatewayErrorToResponse(cause);
   return c.json(response.body, response.status);
  }
 });
}
