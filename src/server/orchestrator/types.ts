import type { OrchestratorKey, OrchestratorStatus, OrchestratorTarget, PaneSnapshot, SendResult } from '../../shared/api.js';
export type { OrchestratorKey } from '../../shared/api.js';
export interface OrchestratorAdapter {
 describeTarget(): OrchestratorTarget;
 getStatus(): Promise<OrchestratorStatus>;
 readScreen(lines?: number): Promise<PaneSnapshot>;
 sendInstruction(text: string): Promise<Omit<SendResult,'requestId'>>;
 sendKey(key: OrchestratorKey): Promise<Omit<SendResult,'requestId'>>;
}
