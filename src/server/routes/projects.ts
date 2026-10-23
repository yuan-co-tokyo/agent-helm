import type { Hono } from 'hono';
import type { AppDeps } from '../app.js';
import type { ProjectSummary, ProjectsResponse } from '../../shared/api.js';
import { StateUnavailableError } from '../status/service.js';
import { GatewayError } from '../agtx/types.js';
import { gatewayErrorToResponse } from './errors.js';
export function registerProjectRoutes(app: Hono, deps: AppDeps) {
 app.get('/api/projects', async c => {
  try {
   const registry = deps.registry;
   const [projects, health] = await Promise.all([registry.list(),registry.directory.getHealth().catch(() => null)]);
   const summaries: ProjectSummary[] = new Array(projects.length);
   let next = 0;
   await Promise.all(Array.from({ length: Math.min(3,projects.length) },async () => {
    while (next < projects.length) {
     const index = next++, p = projects[index]!;
     const summary: ProjectSummary = { id: p.id, name: p.name, pathTail: p.path?.split(/[\\/]/).filter(Boolean).at(-1) ?? null, tuiConnected: p.tuiConnected ?? null, orchestrator: null, attentionCount: null, approvalCount: null, fetchedAt: null };
     let timer: ReturnType<typeof setTimeout> | undefined;
     try {
      const ctx = await registry.get(p.id);
      const state = await Promise.race([ctx.statusService.getState(),new Promise<never>((_,reject) => { timer = setTimeout(() => reject(new GatewayError('timeout')),4000); })]);
      summary.orchestrator = { state: state.orchestrator.state, ...(state.orchestrator.reason ? { reason: state.orchestrator.reason } : {}) };
      summary.attentionCount = state.attention.length;
      summary.approvalCount = state.attention.filter(item => item.kind === 'approval').length;
      summary.fetchedAt = state.fetchedAt;
      if (state.agtx.error) summary.error = state.agtx.error;
     } catch (error) {
      const cause = error instanceof StateUnavailableError ? error.gatewayError : error;
      summary.error = gatewayErrorToResponse(cause instanceof GatewayError ? cause : new GatewayError('unknown')).body.error;
     }
     finally { clearTimeout(timer); }
     summaries[index] = summary;
    }
   }));
   return c.json({ fetchedAt: new Date().toISOString(), agtx: { reachable: !!health, version: health?.version ?? null, tuiConnected: health?.tuiConnected ?? null }, mode: health?.mode ?? null, fixedProjectId: deps.config.agtx.projectName ? projects[0]?.id ?? null : null, projects: summaries } satisfies ProjectsResponse);
  } catch (error) {
   if (!(error instanceof GatewayError)) throw error;
   const response = gatewayErrorToResponse(error); return c.json(response.body,response.status);
  }
 });
}
