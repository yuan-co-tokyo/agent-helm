import type { OrchestratorScreenResponse, OrchestratorKey, OrchestratorStatus, OrchestratorTarget, PaneSnapshot, SendResult } from '../../shared/api.js';
export type { OrchestratorKey } from '../../shared/api.js';
export interface OrchestratorAdapter {
 describeTarget(): OrchestratorTarget;
 getStatus(): Promise<OrchestratorStatus>;
 inspectScreen(lines?: number): Promise<OrchestratorScreenResponse>;
 readScreen(lines?: number): Promise<PaneSnapshot>;
 sendInstruction(text: string): Promise<Omit<SendResult,'requestId'>>;
 sendKey(key: OrchestratorKey): Promise<Omit<SendResult,'requestId'>>;
}
export type { ApprovalDetector } from '../tmux/input-ready.js';
export class OrchestratorError extends Error {
 constructor(public kind: 'not_found'|'ambiguous'|'tmux_error') { super(kind); }
}
