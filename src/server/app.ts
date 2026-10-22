import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { SessionResponse } from '../shared/api.js';
import { SUPPORTED_AGTX_VERSION } from '../shared/constants.js';
import type { HelmConfig } from './config.js';
import type { AgtxGateway } from './agtx/types.js';
import type { OrchestratorAdapter } from './orchestrator/types.js';
import type { Logger } from './log.js';
import { requestLogger } from './log.js';
import { hostGuard, mutationGuard, securityHeaders } from './security.js';
import { registerStateRoutes } from './routes/state.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerOrchestratorRoutes } from './routes/orchestrator.js';
import { registerApprovalRoutes } from './routes/approvals.js';
import { apiError } from './routes/errors.js';
export interface AppDeps {
 config: HelmConfig; gateway: AgtxGateway; orchestrator: OrchestratorAdapter;
 csrfToken: string; appVersion: string; staticRoot?: string | null; logger: Logger;
}
export function createApp(deps: AppDeps): Hono {
 const app = new Hono();
 app.use('*',requestLogger(deps.logger),securityHeaders(),hostGuard(deps.config.listen.port),mutationGuard({ port: deps.config.listen.port, csrfToken: deps.csrfToken }));
 app.get('/api/session',c => c.json({
  csrfToken: deps.csrfToken,
  target: { project: { name: deps.config.agtx.projectName, id: deps.gateway.cachedProject?.id ?? null }, orchestrator: deps.orchestrator.describeTarget() },
  versions: { app: deps.appVersion, agtxSupported: SUPPORTED_AGTX_VERSION, agtx: deps.gateway.lastHealth?.version ?? null }
 } satisfies SessionResponse));
 registerStateRoutes(app,deps); registerTaskRoutes(app,deps);
 registerOrchestratorRoutes(app,deps); registerApprovalRoutes(app,deps);
 app.all('/api/*',c => apiError(c,404,'not_found','API route not found'));
 app.all('/api',c => apiError(c,404,'not_found','API route not found'));
 const root = deps.staticRoot;
 if (root && existsSync(join(root,'index.html'))) {
  app.use('*',serveStatic({ root }));
  app.get('*',c => c.html(readFileSync(join(root,'index.html'),'utf8')));
 } else {
  app.get('*',c => c.text('Web build missing. Run pnpm build.',503));
 }
 app.onError((_err,c) => { deps.logger.error('request_error'); return apiError(c,500,'internal','Internal error'); });
 return app;
}
