import { Hono } from 'hono';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { SessionResponse } from '../shared/api.js';
import { SUPPORTED_AGTX_VERSION } from '../shared/constants.js';
import type { HelmConfig } from './config.js';
import { GatewayError, type AgtxGateway } from './agtx/types.js';
import { ProjectRegistry, ProjectNotFound, type ProjectContext } from './projects/registry.js';
import { isUuid } from '../shared/constants.js';
import { registerProjectRoutes } from './routes/projects.js';
import { gatewayErrorToResponse } from './routes/errors.js';
import type { OrchestratorAdapter } from './orchestrator/types.js';
import type { Logger } from './log.js';
import { requestLogger } from './log.js';
import { hostGuard, mutationGuard, securityHeaders } from './security.js';
import { registerStateRoutes } from './routes/state.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerOrchestratorRoutes } from './routes/orchestrator.js';
import { registerApprovalRoutes } from './routes/approvals.js';
import { apiError } from './routes/errors.js';
import type { StatusService, ApprovalDetector } from './status/index.js';
export interface ProjectDeps {
 approvals: ProjectContext['approvals']; instructions: ProjectContext['instructions'];
 statusService: StatusService; approvalDetector?: ApprovalDetector | null;
 approval?: { settleMs?: number; sendTimeoutMs?: number; sleep?: (ms: number) => Promise<void> };
 config: HelmConfig; gateway: AgtxGateway; orchestrator: OrchestratorAdapter;
 csrfToken: string; appVersion: string; staticRoot?: string | null; logger: Logger;
}
export type AppDeps = Omit<ProjectDeps,'gateway'|'orchestrator'|'statusService'|'approvals'|'instructions'> & { registry: ProjectRegistry };
export function createApp(deps: AppDeps): Hono {
 const app = new Hono();
 app.use('*',requestLogger(deps.logger),securityHeaders(),hostGuard(deps.config.listen.port),mutationGuard({ port: deps.config.listen.port, csrfToken: deps.csrfToken }));
 app.get('/api/session',c => c.json({
  csrfToken: deps.csrfToken,
  target: { fixedProjectName: deps.config.agtx.projectName ?? null },
  versions: { app: deps.appVersion, agtxSupported: SUPPORTED_AGTX_VERSION, agtx: deps.registry.directory.lastHealth?.version ?? null }
 } satisfies SessionResponse));
 registerProjectRoutes(app,deps);
 const projectApps = new WeakMap<ProjectContext,Hono>();
 app.all('/api/projects/:pid/*',async c => {
  const pid = c.req.param('pid');
  if (!isUuid(pid)) return apiError(c,400,'bad_request','Project ID must be a UUID');
  let context: ProjectContext;
  try { context = await deps.registry.get(pid); }
  catch (error) {
   if (error instanceof ProjectNotFound) return apiError(c,404,'project_not_found','Project not found');
   if (!(error instanceof GatewayError)) throw error;
   const result = gatewayErrorToResponse(error); return c.json(result.body,result.status);
  }
  context.active++;
  try {
   if (c.req.method === 'POST') {
    const body: unknown = await c.req.raw.clone().json().catch(() => null);
    if (!body || typeof body !== 'object' || !('projectId' in body) || body.projectId !== pid) return apiError(c,400,'bad_request','Project ID must match request path');
   }
   let projectApp = projectApps.get(context);
   if (!projectApp) {
    projectApp = new Hono();
    const projectDeps = { ...deps, ...context };
    registerStateRoutes(projectApp,projectDeps); registerTaskRoutes(projectApp,projectDeps);
    registerOrchestratorRoutes(projectApp,projectDeps); registerApprovalRoutes(projectApp,projectDeps);
    projectApp.onError((_err,c) => { deps.logger.error('request_error'); return apiError(c,500,'internal','Internal error'); });
    projectApp.all('*',c => apiError(c,404,'not_found','API route not found'));
    projectApps.set(context,projectApp);
   }
   return await projectApp.fetch(c.req.raw);
  }
  finally { context.active--; }
 });
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
