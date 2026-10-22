import type { AgtxKey, PaneSnapshot, PhaseStatus, SendOutcome, TaskStatus } from '../../shared/api.js';
export type { AgtxKey } from '../../shared/api.js';
export type AgtxPane = PaneSnapshot & { inputText?: string | null };
export interface AgtxHealth { version: string; mode: string | null; projectCount: number | null; tuiConnected: boolean | null; fetchedAt: string }
export interface ProjectRef { id: string; name: string; path: string | null }
export interface TaskSummary {
 id: string; title: string; status: TaskStatus; agent: string | null; plugin: string | null; cycle: number;
 branchName: string | null; prNumber: number | null; prUrl?: string | null; escalationNote: string | null;
 updatedAt: string | null; depsSatisfied: boolean | null; allowedActions: string[]; phaseStatus: PhaseStatus;
 phaseAgeSecs: number | null; conflicted: boolean | null; conflictingFiles: string[];
 agentState?: string | null; tuiConnected?: boolean | null;
}
export interface TaskDetail extends TaskSummary {
 description: string | null; worktreePath: string | null; sessionName: string | null; prUrl: string | null;
 baseBranch: string | null; referencedTasks: string[]; createdAt: string | null; agentState: string | null;
 blockedReason: string | null; blockingTasks: string[];
}
export interface KeySendResult { outcome: SendOutcome; reason?: string }
export type GatewayErrorKind = 'unreachable'|'timeout'|'not_found'|'conflict'|'bad_response'|'unknown'|'project_not_found'|'project_ambiguous';
export class GatewayError extends Error {
 constructor(public readonly kind: GatewayErrorKind, public readonly status?: number) { super('agtx: ' + kind); this.name = 'GatewayError'; }
}
export interface AgtxGateway {
 readonly cachedProject: ProjectRef | null;
 readonly lastHealth: AgtxHealth | null;
 getHealth(): Promise<AgtxHealth>;
 resolveProject(): Promise<ProjectRef>;
 listTasks(): Promise<TaskSummary[]>;
 getTask(taskId: string): Promise<TaskDetail>;
 readPane(taskId: string, lines?: number): Promise<AgtxPane>;
 sendKey(taskId: string, key: AgtxKey): Promise<KeySendResult>;
}
