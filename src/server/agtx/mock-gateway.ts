import type { AgtxKey } from '../../shared/api.js';
import type { AgtxPane } from './types.js';
import { stripAnsi, stripFaint } from '../text.js';
import { assertTaskId, clampLines, isAgtxKey } from './schemas.js';
import { GatewayError } from './types.js';
import type { AgtxGateway, AgtxHealth, ProjectRef, TaskDetail, KeySendResult } from './types.js';
type Method = 'getHealth'|'resolveProject'|'listTasks'|'getTask'|'readPane'|'sendKey';
export class MockAgtxGateway implements AgtxGateway {
 cachedProject: ProjectRef | null = null;
 lastHealth: AgtxHealth | null = null;
 health: AgtxHealth = { version: '1.0.6', mode: 'standalone', projectCount: 1, tuiConnected: true, fetchedAt: new Date().toISOString() };
 project: ProjectRef = { id: '11111111-1111-4111-8111-111111111111', name: 'agent-helm', path: null };
 tasks: TaskDetail[] = [];
 panes = new Map<string,string>();
 onKey?: (taskId: string, key: AgtxKey) => void;
 sentKeys: { taskId: string; key: AgtxKey }[] = [];
 private failures = new Map<Method,GatewayError>();
 setHealth(health: AgtxHealth) { this.health = health; }
 setProject(project: ProjectRef) { this.project = project; this.cachedProject = null; }
 setTasks(tasks: TaskDetail[]) { this.tasks = tasks; }
 setPane(id: string, text: string) { this.panes.set(id,text); }
 failNext(method: Method, error: GatewayError) { this.failures.set(method,error); }
 private check(method: Method) { const e = this.failures.get(method); if (e) { this.failures.delete(method); throw e; } }
 async getHealth() { this.check('getHealth'); return this.lastHealth = { ...this.health }; }
 async resolveProject() { this.check('resolveProject'); return this.cachedProject = { ...this.project }; }
 async listTasks() { this.check('listTasks'); return structuredClone(this.tasks); }
 async getTask(id: string) {
  assertTaskId(id); this.check('getTask');
  const task = this.tasks.find(t => t.id === id);
  if (!task) throw new GatewayError('not_found',404);
  return structuredClone(task);
 }
 async readPane(id: string, lines = 200): Promise<AgtxPane> {
  assertTaskId(id); this.check('readPane');
  if (!this.panes.has(id)) throw new GatewayError('not_found',404);
  return { text: stripAnsi(this.panes.get(id)!), inputText: stripFaint(this.panes.get(id)!), lines: clampLines(lines), source: 'agtx', capturedAt: new Date().toISOString() };
 }
 async sendKey(id: string, key: AgtxKey): Promise<KeySendResult> {
  if (!isAgtxKey(key)) return { outcome: 'rejected', reason: 'key_not_allowed' };
  assertTaskId(id);
  try {
   this.check('sendKey');
   const task = await this.getTask(id);
   if (task.status === 'done') return { outcome: 'rejected', reason: 'conflict' };
   this.sentKeys.push({ taskId: id, key });
   this.onKey?.(id,key);
   return { outcome: 'sent' };
  } catch (e) {
   const err = e instanceof GatewayError ? e : new GatewayError('unknown');
   return { outcome: ['not_found','conflict','project_not_found','project_ambiguous'].includes(err.kind) ? 'rejected' : 'unknown', reason: err.kind };
  }
 }
}
