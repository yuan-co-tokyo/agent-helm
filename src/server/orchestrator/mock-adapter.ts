import { ORCHESTRATOR_KEYS } from '../../shared/api.js';
import type { InputReady, OrchestratorKey, OrchestratorStatus, OrchestratorTarget, SendResult } from '../../shared/api.js';
import { clampLines } from '../agtx/schemas.js';
import { stripAnsi } from '../text.js';
import { validateInstruction } from './validate.js';
import { DEFAULT_INSTRUCTION_MAX_CHARS } from '../../shared/constants.js';
import { OrchestratorError } from './types.js';
import type { OrchestratorAdapter } from './types.js';
export class MockOrchestratorAdapter implements OrchestratorAdapter {
 status: OrchestratorStatus;
 text = '';
 inputReady: InputReady = { ok: false, reason: 'not_implemented' };
 instructions: string[] = [];
 keys: OrchestratorKey[] = [];
 constructor(target: OrchestratorTarget = { socket: 'agent-helm-test', session: 'test', window: 'orchestrator' }) {
  this.status = { state: 'error', target, paneId: null, currentCommand: null, reason: 'not_implemented', checkedAt: new Date().toISOString() };
 }
 describeTarget() { return { ...this.status.target }; }
 async getStatus() { return structuredClone(this.status); }
 async readScreen(lines = 200) { return { text: stripAnsi(this.text), lines: clampLines(lines), source: 'tmux' as const, capturedAt: new Date().toISOString() }; }
 async inspectScreen(lines?: number) {
  if (this.status.state !== 'running') throw new OrchestratorError(this.status.state === 'error' ? 'tmux_error' : this.status.state);
  return { ...await this.readScreen(lines), approval: null, inputReady: { ...this.inputReady } };
 }
 async sendInstruction(text: string): Promise<Omit<SendResult,'requestId'>> {
  const valid = validateInstruction(text,DEFAULT_INSTRUCTION_MAX_CHARS);
  if (!valid.ok) return { outcome: 'rejected', reason: valid.reason };
  if (this.status.state !== 'running' || !this.inputReady.ok) return { outcome: 'rejected', reason: this.inputReady.reason ?? 'not_ready' };
  this.instructions.push(text); return { outcome: 'sent' };
 }
 async sendKey(key: OrchestratorKey): Promise<Omit<SendResult,'requestId'>> {
  if (!(ORCHESTRATOR_KEYS as readonly string[]).includes(key)) return { outcome: 'rejected', reason: 'key_not_allowed' };
  if (this.status.state !== 'running') return { outcome: 'rejected', reason: 'not_ready' };
  this.keys.push(key); return { outcome: 'sent' };
 }
}
