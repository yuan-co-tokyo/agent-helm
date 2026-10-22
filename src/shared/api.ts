export const TASK_STATUSES = ['backlog','planning','running','review','done'] as const;
export const PHASE_STATUSES = ['working','blocked','idle','ready','exited'] as const;
export const DISPLAY_STATES = ['disconnected','stale','approval','blocked','error','reviewing','phase_done','running','idle','unknown'] as const;
export const AGTX_KEYS = ['y','n','1','2','3','Enter','Escape','Up','Down'] as const;
export const ORCHESTRATOR_KEYS = ['y','n','a','1','2','3','4','Enter','Escape','Up','Down'] as const;
export const PR_DISPLAY_STATES = ['none','open_review_pending','approved_waiting_merge','merged','closed','unknown'] as const;
export const SEND_OUTCOMES = ['sent','rejected','unknown'] as const;
export const APPROVAL_MEANINGS = ['approve','approve_always','deny','unknown'] as const;
export const APPROVAL_KINDS = ['approval','trust'] as const;
export type ApprovalKind = typeof APPROVAL_KINDS[number];
export const AGENT_KINDS = ['claude','codex','generic'] as const;
export const API_ERROR_CODES = ['bad_request','key_not_sendable','invalid_host','forbidden_origin','csrf_invalid','unsupported_media_type','payload_too_large','not_found','gone','stale','conflict','agtx_unreachable','agtx_timeout','agtx_bad_response','agtx_project_not_found','agtx_project_ambiguous','not_implemented','internal'] as const;
export type TaskStatus = typeof TASK_STATUSES[number];
export type PhaseStatus = typeof PHASE_STATUSES[number] | null;
export type DisplayState = typeof DISPLAY_STATES[number];
export type AgtxKey = typeof AGTX_KEYS[number];
export type OrchestratorKey = typeof ORCHESTRATOR_KEYS[number];
export type PrDisplayState = typeof PR_DISPLAY_STATES[number];
export type SendOutcome = typeof SEND_OUTCOMES[number];
export type ApprovalMeaning = typeof APPROVAL_MEANINGS[number];
export type AgentKind = typeof AGENT_KINDS[number];
export type ApiErrorCode = typeof API_ERROR_CODES[number];
export interface ApiErrorBody { error: { code: ApiErrorCode; message: string } }
export interface PaneSnapshot { text: string; capturedAt: string; lines: number; source: 'agtx' | 'tmux' }
export interface ApprovalOption { key: string; shortcut: string | null; label: string; meaning: ApprovalMeaning; warn: boolean; sendable: boolean; unsendableReason?: 'key_not_in_target_set' }
export interface ApprovalPrompt { kind: ApprovalKind; detail: string | null; agentKind: AgentKind; question: string; options: ApprovalOption[]; fingerprint: string; capturedAt: string }
export type ApprovalTarget = { kind: 'task'; taskId: string } | { kind: 'orchestrator' };
export interface PrInfo { url: string | null; number: number | null; state: PrDisplayState; fetchedAt: string | null }
export interface TestResultInfo { status: 'not_available'; source: string | null }
export interface TaskView {
 id: string; title: string; status: TaskStatus; agent: string | null; phaseStatus: PhaseStatus;
 agentState: string | null; phaseAgeSecs: number | null; displayState: DisplayState;
 attentionReason: string | null; depsSatisfied: boolean | null; blockingTasks: string[];
 cycle: number; branchName: string | null; pr: PrInfo; updatedAt: string | null;
}
export interface TaskDetailView extends TaskView {
 description: string | null; worktreePath: string | null; sessionName: string | null;
 baseBranch: string | null; referencedTasks: string[]; blockedReason: string | null;
 escalationNote: string | null; pane: PaneSnapshot | null; paneError: ApiErrorBody['error'] | null;
 approval: ApprovalPrompt | null; testResult: TestResultInfo;
}
export interface AttentionItem { id: string; target: ApprovalTarget; kind: 'approval'|'blocked'|'error'|'disconnected'|'stale'; title: string; reason: string; since: string | null }
export interface OrchestratorTarget { socket: string; session: string; window: string }
export interface OrchestratorStatus { state: 'running'|'not_found'|'ambiguous'|'error'; target: OrchestratorTarget; paneId: string | null; currentCommand: string | null; reason?: string; checkedAt: string }
export interface InputReady { ok: boolean; reason?: string }
export type OrchestratorScreenResponse = PaneSnapshot & { approval: ApprovalPrompt | null; inputReady: InputReady };
export interface SendResult { requestId: string; outcome: SendOutcome; reason?: string; after?: PaneSnapshot }
export interface InstructionRequest { text: string; requestId: string }
export interface ApprovalRespondRequest { target: ApprovalTarget; fingerprint: string; key: string; requestId: string }
export interface AgtxStatus { checkedAt?: string; reachable: boolean; version: string | null; tuiConnected: boolean | null; error?: ApiErrorBody['error'] }
export interface StateResponse { fetchedAt: string; agtx: AgtxStatus; orchestrator: OrchestratorStatus; tasks: TaskView[]; attention: AttentionItem[] }
export interface SessionResponse {
 csrfToken: string; target: { project: { name: string; id: string | null }; orchestrator: OrchestratorTarget };
 versions: { app: string; agtxSupported: string; agtx: string | null };
}
