import type { ApprovalPrompt, AttentionItem, DisplayState } from '../../shared/api.js';
import type { TaskDetail, TaskSummary } from '../agtx/types.js';
export const STALE_PHASE_AGE_SECS = 30;
type Task = TaskSummary | TaskDetail;
const active = (task: Task) => ['planning','running','review'].includes(task.status);
export function classifyTask({ task, agtxTuiConnected, approval, disconnected }: {
 task: Task; agtxTuiConnected: boolean | null; approval: ApprovalPrompt | null; disconnected: boolean;
}): DisplayState {
 if (disconnected) return 'disconnected';
 if (task.tuiConnected === false || agtxTuiConnected === false || (task.phaseAgeSecs ?? 0) > STALE_PHASE_AGE_SECS) return 'stale';
 if (approval) return 'approval';
 if (task.phaseStatus === 'blocked' || task.agentState === 'blocked') return 'blocked';
 if (task.phaseStatus === 'exited' && ['planning','running'].includes(task.status)) return 'error';
 if (task.status === 'review' && task.phaseStatus === 'working') return 'reviewing';
 if (task.phaseStatus === 'ready') return 'phase_done';
 if (task.phaseStatus === 'working') return 'running';
 if (task.phaseStatus === 'idle') return 'idle';
 return 'unknown';
}
export function attentionFor(task: Task, displayState: DisplayState, approval: ApprovalPrompt | null,
 agtxTuiConnected: boolean | null = null): { reason: string | null; item: AttentionItem | null } {
 let kind: AttentionItem['kind'] = 'blocked';
 let reason: string | null = null;
 let actionable = true;
 if (displayState === 'approval' && approval) { kind = 'approval'; reason = approval.question; }
 else if (displayState === 'blocked') reason = ('blockedReason' in task ? task.blockedReason : null) ?? '理由不明';
 else if (displayState === 'error') { kind = 'error'; reason = 'phase exited'; }
 else if (displayState === 'stale') {
  kind = 'stale'; reason = task.tuiConnected === false || agtxTuiConnected === false ? 'TUI未接続' : `状態更新が ${task.phaseAgeSecs} 秒前`;
  // Backlog/done tasks are not progressing, so a stale runtime is not something to act on.
  actionable = active(task);
 } else if (task.escalationNote) reason = `エスカレーション: ${task.escalationNote}`;
 else if (task.depsSatisfied === false) {
  const ids = 'blockingTasks' in task ? (task.blockingTasks.length ? task.blockingTasks : task.referencedTasks) : [];
  reason = `依存未完了: ${ids.length ? ids.join(', ') : '理由不明'}`;
  actionable = active(task);
 }
 return { reason, item: reason && actionable ? {
  id: `task:${task.id}:${kind}`, target: { kind: 'task', taskId: task.id }, kind, title: task.title, reason, since: task.updatedAt
 } : null };
}
export function needsDetail(task: TaskSummary): boolean {
 return (active(task) && ((task.phaseStatus === null || ['blocked','idle','exited'].includes(task.phaseStatus)) || task.agentState === 'blocked' ||
  (task.phaseAgeSecs ?? 0) > STALE_PHASE_AGE_SECS || task.tuiConnected === false)) || task.depsSatisfied === false || !!task.escalationNote;
}
export function needsApprovalCheck(task: Task): boolean {
 return ['blocked','idle'].includes(task.phaseStatus ?? '') || (active(task) && (task.phaseStatus === 'exited' || task.phaseStatus === null));
}
export function needsPaneCheck(task: Task, detector: unknown): task is TaskDetail {
 return !!detector && 'sessionName' in task && !!task.sessionName && needsApprovalCheck(task);
}
