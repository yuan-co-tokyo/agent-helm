import type { OrchestratorTarget, OrchestratorStatus, SendResult } from '../../shared/api.js';
import type { ProjectRef } from '../agtx/types.js';
import type { HelmConfig } from '../config.js';
import { OrchestratorError, type OrchestratorAdapter } from '../orchestrator/types.js';
type Resolution = { target: OrchestratorTarget; unresolved?: 'session_unresolved' | 'target_collision' };
function resolve(project: ProjectRef, config: HelmConfig): Resolution {
 const override = Object.hasOwn(config.orchestrators,project.name) ? config.orchestrators[project.name] : undefined;
 const session = override?.session ?? (config.agtx.projectName === project.name ? config.orchestrator.session : undefined) ?? project.name.replace(/[.:]/g,'_');
 const target = { socket: override?.tmuxSocket ?? config.orchestrator.tmuxSocket, session, window: override?.window ?? config.orchestrator.window };
 return { target, ...(/^[A-Za-z0-9_-]+$/.test(session) ? {} : { unresolved: 'session_unresolved' as const }) };
}
export function resolveOrchestratorTarget(project: ProjectRef, all: ProjectRef[], config: HelmConfig): Resolution {
 const result = resolve(project,config);
 if (result.unresolved) return result;
 const key = JSON.stringify(result.target);
 if (all.filter(p => { const r = resolve(p,config); return !r.unresolved && JSON.stringify(r.target) === key; }).length > 1) return { ...result, unresolved: 'target_collision' };
 return result;
}
export class UnresolvedOrchestratorAdapter implements OrchestratorAdapter {
 constructor(private target: OrchestratorTarget, private reason: string) {}
 describeTarget() { return this.target; }
 async getStatus(): Promise<OrchestratorStatus> { return { state: 'not_found', target: this.target, reason: this.reason, paneId: null, currentCommand: null, checkedAt: new Date().toISOString() }; }
 async inspectScreen(): Promise<never> { throw new OrchestratorError('not_found'); }
 async readScreen(): Promise<never> { throw new OrchestratorError('not_found'); }
 async sendInstruction(): Promise<Omit<SendResult,'requestId'>> { return { outcome: 'rejected', reason: this.reason }; }
 async sendKey() { return this.sendInstruction(); }
}
