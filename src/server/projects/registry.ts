import { RequestStore, TargetLocks } from '../approval/store.js';
import { RequestCache } from '../orchestrator/request-cache.js';
import type { SendResult, OrchestratorTarget } from '../../shared/api.js';
import { isUuid } from '../../shared/constants.js';
import { HttpAgtxGateway } from '../agtx/http-gateway.js';
import { GatewayError, type AgtxDirectory, type AgtxGateway, type ProjectRef } from '../agtx/types.js';
import type { HelmConfig } from '../config.js';
import type { OrchestratorAdapter } from '../orchestrator/types.js';
import { TmuxOrchestratorAdapter } from '../orchestrator/tmux-adapter.js';
import { StatusService } from '../status/service.js';
import { GhPrService } from '../status/pr.js';
import type { ApprovalDetector } from '../status/types.js';
import { resolveOrchestratorTarget, UnresolvedOrchestratorAdapter } from './target.js';
export class ProjectNotFound extends Error {}
export interface ProjectContext { project: ProjectRef; gateway: AgtxGateway; orchestrator: OrchestratorAdapter; statusService: StatusService; approvals: { store: RequestStore; locks: TargetLocks }; instructions: RequestCache<SendResult>; active: number; signature: string }
export interface RegistryOptions {
 config: HelmConfig; directory: AgtxDirectory; now?: () => number;
 gatewayFactory?: (project: ProjectRef) => AgtxGateway;
 orchestratorFactory?: (target: OrchestratorTarget, project: ProjectRef) => OrchestratorAdapter;
 statusFactory?: (gateway: AgtxGateway, orchestrator: OrchestratorAdapter) => StatusService;
 approvalDetector?: ApprovalDetector | null;
}
export class ProjectRegistry {
 private snapshot: ProjectRef[] | null = null;
 private fetchedAt = -Infinity;
 private flight: Promise<ProjectRef[]> | null = null;
 private contexts = new Map<string,ProjectContext>();
 readonly directory: AgtxDirectory;
 constructor(private options: RegistryOptions) { this.directory = options.directory; }
 async list(): Promise<ProjectRef[]> {
  const now = (this.options.now ?? Date.now)();
  if (this.snapshot && now - this.fetchedAt < 5000) return this.visible(this.snapshot);
  if (!this.flight) this.flight = this.directory.listProjects().then(projects => { this.snapshot = projects; this.fetchedAt = now; return projects; }).finally(() => { this.flight = null; });
  return this.visible(await this.flight);
 }
 private visible(projects: ProjectRef[]) {
  const name = this.options.config.agtx.projectName;
  if (!name) return projects;
  const found = projects.filter(p => p.name === name);
  if (!found.length) throw new GatewayError('project_not_found');
  if (found.length !== 1) throw new GatewayError('project_ambiguous');
  return found;
 }
 async get(id: string): Promise<ProjectContext> {
  if (!isUuid(id)) throw new ProjectNotFound();
  const project = (await this.list()).find(p => p.id === id);
  if (!project) throw new ProjectNotFound();
  const resolution = resolveOrchestratorTarget(project,this.snapshot!,this.options.config);
  const signature = JSON.stringify([project.id,project.name,project.path,resolution]);
  const existing = this.contexts.get(id);
  if (existing?.signature === signature) { existing.project = project; return existing; }
  // Never replace locks/idempotency state while a request is using this context.
  if (existing?.active) throw new GatewayError('conflict');
  const gateway = this.options.gatewayFactory?.(project) ?? new HttpAgtxGateway({ ...this.options.config.agtx, projectId: id });
  const orchestrator = resolution.unresolved ? new UnresolvedOrchestratorAdapter(resolution.target,resolution.unresolved) : this.options.orchestratorFactory?.(resolution.target,project) ?? new TmuxOrchestratorAdapter(resolution.target,{ maxChars: this.options.config.limits.instructionMaxChars });
  const statusService = this.options.statusFactory?.(gateway,orchestrator) ?? new StatusService({ gateway, orchestrator, pr: new GhPrService(), detector: this.options.approvalDetector });
  const context = { project, gateway, orchestrator, statusService, approvals: { store: new RequestStore(), locks: new TargetLocks() }, instructions: new RequestCache<SendResult>(), active: 0, signature };
  this.contexts.delete(id);
  while (this.contexts.size >= 32) {
   const idle = [...this.contexts].find(([,ctx]) => !ctx.active);
   if (!idle) throw new GatewayError('conflict');
   this.contexts.delete(idle[0]);
  }
  this.contexts.set(id,context);
  return context;
 }
}
