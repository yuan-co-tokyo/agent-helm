import type { Hono } from 'hono';
import type { ProjectDeps } from '../app.js';
import { gatewayErrorToResponse } from './errors.js';
import { GatewayError } from '../agtx/types.js';
import { StateUnavailableError } from '../status/service.js';
export function registerStateRoutes(app: Hono, deps: ProjectDeps) {
 app.get('/api/projects/:pid/state', async c => {
  try { return c.json(await deps.statusService.getState()); }
  catch (error) {
   const cause = error instanceof StateUnavailableError ? error.gatewayError : error;
   if (!(cause instanceof GatewayError)) throw error;
   const response = gatewayErrorToResponse(cause);
   return c.json(response.body, response.status);
  }
 });
}
