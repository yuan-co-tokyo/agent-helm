import { createApprovalDetector } from '../approval/adapter.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ORCHESTRATOR_KEYS, type OrchestratorKey, type OrchestratorTarget, type SendResult } from '../../shared/api.js';
import { DEFAULT_INSTRUCTION_MAX_CHARS } from '../../shared/constants.js';
import { clampLines } from '../agtx/schemas.js';
import { stripAnsi } from '../text.js';
import { ExecFileTmuxRunner, type TmuxRunner } from '../tmux/exec.js';
import { resolvePane } from '../tmux/target.js';
import { assessInputReady, type ApprovalDetector } from '../tmux/input-ready.js';
import { OrchestratorError, type OrchestratorAdapter } from './types.js';
import { validateInstruction } from './validate.js';
type Result = Omit<SendResult,'requestId'>;
export class TmuxOrchestratorAdapter implements OrchestratorAdapter {
 private runner: TmuxRunner;
 private detector: ApprovalDetector;
 private busy = new Set<string>();
 private target: OrchestratorTarget;
 constructor(target: OrchestratorTarget, private opts: { runner?: TmuxRunner; detector?: ApprovalDetector; maxChars?: number; settleMs?: number; timeoutMs?: number } = {}) {
  this.target = { ...target };
  this.runner = opts.runner ?? new ExecFileTmuxRunner(target.socket,{ timeoutMs: opts.timeoutMs });
  this.detector = opts.detector ?? createApprovalDetector('orchestrator');
 }
 describeTarget() { return { ...this.target }; }
 private resolve() { return resolvePane(this.runner,this.target.session,this.target.window); }
 async getStatus() { return { ...await this.resolve(), target: this.describeTarget(), checkedAt: new Date().toISOString() }; }
 private async capture(paneId: string, lines?: number) {
  const count = clampLines(lines);
  const text = stripAnsi(await this.runner.run(['capture-pane','-p','-J','-t',paneId,'-S',`-${count}`])).replace(/\n+$/,'').split('\n').slice(-count).join('\n');
  return { text, lines: count, source: 'tmux' as const, capturedAt: new Date().toISOString() };
 }
 async readScreen(lines?: number) {
  const pane = await this.resolve();
  if (pane.state !== 'running' || !pane.paneId) throw new OrchestratorError(pane.state === 'not_found' || pane.state === 'ambiguous' ? pane.state : 'tmux_error');
  try { return await this.capture(pane.paneId,lines); } catch { throw new OrchestratorError('tmux_error'); }
 }
 async inspectScreen(lines?: number) {
  const screen = await this.readScreen(lines);
  const approval = this.detector.detect(screen.text,screen.capturedAt);
  return { ...screen, approval, inputReady: assessInputReady(screen.text,{ approval }) };
 }
 private async after(paneId: string): Promise<Result> {
  await delay(this.opts.settleMs ?? 300);
  try { return { outcome: 'sent', after: await this.capture(paneId) }; } catch { return { outcome: 'sent' }; }
 }
 async sendInstruction(text: string): Promise<Result> {
  const valid = validateInstruction(text,this.opts.maxChars ?? DEFAULT_INSTRUCTION_MAX_CHARS);
  if (!valid.ok) return { outcome: 'rejected', reason: valid.reason };
  const pane = await this.resolve();
  if (pane.state !== 'running' || !pane.paneId) return { outcome: 'rejected', reason: pane.state === 'error' ? 'tmux_error' : pane.reason ?? pane.state };
  const id = pane.paneId;
  if (this.busy.has(id)) return { outcome: 'rejected', reason: 'busy' };
  this.busy.add(id);
  const buffer = `agent-helm-${randomUUID()}`;
  let loaded = false;
  let attempted = false;
  try {
   const screen = await this.capture(id);
   const ready = assessInputReady(screen.text,{ approval: this.detector.detect(screen.text,screen.capturedAt) });
   if (!ready.ok) return { outcome: 'rejected', reason: ready.reason };
   const unchanged = async () => { const next = await this.resolve(); return next.state === 'running' && next.paneId === id; };
   if (!await unchanged()) return { outcome: 'rejected', reason: 'target_changed' };
   loaded = true;
   await this.runner.run(['load-buffer','-b',buffer,'-'],{ input: text });
   if (!await unchanged()) return { outcome: 'rejected', reason: 'target_changed' };
   attempted = true;
   await this.runner.run(['paste-buffer','-p','-d','-b',buffer,'-t',id]);
   loaded = false;
   await this.runner.run(['send-keys','-t',id,'Enter']);
   return await this.after(id);
  } catch { return { outcome: attempted ? 'unknown' : 'rejected', reason: 'tmux_error' }; }
  finally {
   if (loaded) { try { await this.runner.run(['delete-buffer','-b',buffer]); } catch { /* Best effort cleanup. */ } }
   this.busy.delete(id);
  }
 }
 async sendKey(key: OrchestratorKey): Promise<Result> {
  if (!(ORCHESTRATOR_KEYS as readonly string[]).includes(key)) return { outcome: 'rejected', reason: 'key_not_allowed' };
  const pane = await this.resolve();
  if (pane.state !== 'running' || !pane.paneId) return { outcome: 'rejected', reason: pane.state === 'error' ? 'tmux_error' : pane.reason ?? pane.state };
  const id = pane.paneId;
  if (this.busy.has(id)) return { outcome: 'rejected', reason: 'busy' };
  this.busy.add(id);
  try { await this.runner.run(['send-keys','-t',id,key]); return await this.after(id); }
  catch { return { outcome: 'unknown', reason: 'tmux_error' }; }
  finally { this.busy.delete(id); }
 }
}
