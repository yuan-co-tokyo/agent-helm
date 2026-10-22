import { tailLines } from '../approval/normalize.js';
import type { AgtxStatus, ApprovalPrompt, OrchestratorStatus, StateResponse, TaskDetailView, TaskView } from '../../shared/api.js';
import { GatewayError } from '../agtx/types.js';
import type { AgtxGateway, TaskDetail, TaskSummary } from '../agtx/types.js';
import type { AppDeps } from '../app.js';
import type { Logger } from '../log.js';
import type { OrchestratorAdapter } from '../orchestrator/types.js';
import { gatewayErrorToResponse } from '../routes/errors.js';
import { attentionFor, classifyTask, inputState, needsApprovalCheck, needsDetail, needsPaneCheck } from './classify.js';
import { GhPrService } from './pr.js';
import type { ApprovalDetector, PrLookup } from './types.js';
const gatewayError = (error: unknown) => error instanceof GatewayError ? error : new GatewayError('unknown');
export class StateUnavailableError extends Error {
 constructor(public readonly gatewayError: GatewayError) { super(gatewayError.message); this.name = 'StateUnavailableError'; }
}
interface StatusDeps { gateway: AgtxGateway; orchestrator: OrchestratorAdapter; pr: PrLookup; detector?: ApprovalDetector | null; now?: () => number; logger?: Logger }
export class StatusService {
 private snapshot: StateResponse | null = null;
 private flight: Promise<StateResponse> | null = null;
 private readonly now: () => number;
 constructor(private readonly deps: StatusDeps) { this.now = deps.now ?? Date.now; }
 getState(): Promise<StateResponse> {
  if (!this.flight) this.flight = this.fetchState().finally(() => { this.flight = null; });
  return this.flight;
 }
 private async fetchState(): Promise<StateResponse> {
  const checkedAt = new Date(this.now()).toISOString();
  const [health, list, status] = await Promise.allSettled([
   this.deps.gateway.getHealth(), this.deps.gateway.listTasks(), this.deps.orchestrator.getStatus()
  ]);
  const orchestrator: OrchestratorStatus = status.status === 'fulfilled' ? status.value : {
   state: 'error', target: this.deps.orchestrator.describeTarget(), paneId: null, currentCommand: null, reason: 'status_unavailable', checkedAt
  };
  const lastHealth = health.status === 'fulfilled' ? health.value : this.deps.gateway.lastHealth;
  const agtx: AgtxStatus = { reachable: health.status === 'fulfilled', version: lastHealth?.version ?? null,
   tuiConnected: health.status === 'fulfilled' ? health.value.tuiConnected : null, checkedAt };
  if (health.status === 'rejected') agtx.error = gatewayErrorToResponse(gatewayError(health.reason)).body.error;
  if (list.status === 'rejected') {
   const error = gatewayError(list.reason);
   if (!this.snapshot) throw new StateUnavailableError(error);
   agtx.error = gatewayErrorToResponse(error).body.error;
   return { fetchedAt: this.snapshot.fetchedAt, agtx, orchestrator,
    tasks: this.snapshot.tasks.map(task => ({ ...task, displayState: 'disconnected' })), attention: this.snapshot.attention };
  }
  // Four workers bound both detail and pane reads while preserving list order.
  const results: { view: TaskView; item: ReturnType<typeof attentionFor>['item'] }[] = new Array(list.value.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, list.value.length) }, async () => {
   while (next < list.value.length) {
    const index = next++;
    let task: TaskSummary = list.value[index]!;
    if (needsDetail(task)) {
     try { task = await this.deps.gateway.getTask(task.id); } catch { /* Keep summary on a detail failure. */ }
    }
    let approval: ApprovalPrompt | null = null;
    let input: ReturnType<typeof inputState> = null;
    if (needsPaneCheck(task, this.deps.detector)) {
     try {
      const pane = await this.deps.gateway.readPane(task.id, 200);
      input = inputState(pane.text);
      approval = this.deps.detector!.detect(tailLines(pane.text).join('\n'), pane.capturedAt, task.agent);
     } catch { /* Detection and pane failure are not approval evidence. */ }
    }
    const view = await this.toTaskView(task, approval, agtx.tuiConnected, false, input);
    results[index] = { view, item: attentionFor(task, view.displayState, approval, agtx.tuiConnected).item };
   }
  }));
  const result: StateResponse = { fetchedAt: new Date(this.now()).toISOString(), agtx, orchestrator,
   tasks: results.map(r => r.view), attention: results.flatMap(r => r.item ? [r.item] : []) };
  this.snapshot = structuredClone(result);
  return result;
 }
 private async toTaskView(task: TaskSummary | TaskDetail, approval: ApprovalPrompt | null, tuiConnected: boolean | null, wait: boolean, input: ReturnType<typeof inputState> = null): Promise<TaskView> {
  const displayState = classifyTask({ task, approval, agtxTuiConnected: tuiConnected, disconnected: false, input });
  return { id: task.id, title: task.title, status: task.status, agent: task.agent, phaseStatus: task.phaseStatus,
   agentState: task.agentState ?? null, phaseAgeSecs: task.phaseAgeSecs, displayState,
   attentionReason: attentionFor(task, displayState, approval, tuiConnected).reason, depsSatisfied: task.depsSatisfied,
   blockingTasks: 'blockingTasks' in task ? task.blockingTasks : [],
   cycle: task.cycle, branchName: task.branchName, pr: await this.deps.pr.lookup(task.prUrl ?? null, task.prNumber, { wait }), updatedAt: task.updatedAt };
 }
 async getTaskDetail(id: string): Promise<TaskDetailView> {
  const [tuiConnected, tasks] = await Promise.all([
   this.deps.gateway.getHealth().then(health => health.tuiConnected, () => null), this.deps.gateway.listTasks()
  ]);
  if (!tasks.some(task => task.id === id)) throw new GatewayError('not_found');
  const task = await this.deps.gateway.getTask(id);
  let pane: TaskDetailView['pane'] = null;
  let paneError: TaskDetailView['paneError'] = null;
  let approval: ApprovalPrompt | null = null;
  try { pane = await this.deps.gateway.readPane(id, 200); }
  catch (error) { paneError = gatewayErrorToResponse(gatewayError(error)).body.error; }
  if (pane && this.deps.detector && needsApprovalCheck(task)) {
   try { approval = this.deps.detector.detect(tailLines(pane.text).join('\n'), pane.capturedAt, task.agent); } catch { /* Leave approval null. */ }
  }
  return { ...await this.toTaskView(task, approval, tuiConnected, true, pane ? inputState(pane.text) : null),
   description: task.description, worktreePath: task.worktreePath, sessionName: task.sessionName, baseBranch: task.baseBranch,
   referencedTasks: task.referencedTasks, blockedReason: task.blockedReason, escalationNote: task.escalationNote,
   pane, paneError, approval, testResult: { status: 'not_available', source: 'pane' } };
 }
}
const services = new WeakMap<AppDeps, StatusService>();
export function statusServiceFor(deps: AppDeps): StatusService {
 if (deps.statusService) return deps.statusService;
 let service = services.get(deps);
 if (!service) {
  service = new StatusService({ gateway: deps.gateway, orchestrator: deps.orchestrator, pr: new GhPrService(), detector: deps.approvalDetector, logger: deps.logger });
  services.set(deps, service);
 }
 return service;
}
