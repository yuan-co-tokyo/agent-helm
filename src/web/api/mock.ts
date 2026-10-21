import { DISPLAY_STATES, PR_DISPLAY_STATES, type StateResponse, type TaskDetailView } from '../../shared/api.js';
import { HelmApiError } from './client.js';
const now = '2026-10-21T03:00:00.000Z';
export const mockTasks: TaskDetailView[] = DISPLAY_STATES.map((displayState,index) => ({
 id: `00000000-0000-4000-8000-${String(index + 1).padStart(12,'0')}`, title: `${index + 1}. ${displayState} サンプル`, status: 'running', agent: index % 2 ? 'codex' : null, phaseStatus: 'working', agentState: null, phaseAgeSecs: 10, displayState, attentionReason: null, depsSatisfied: index === 3 ? false : true, blockingTasks: index === 3 ? ['00000000-0000-4000-8000-000000000001'] : [], cycle: 1, branchName: 'task/example', updatedAt: now,
 pr: { state: PR_DISPLAY_STATES[index % PR_DISPLAY_STATES.length]!, number: index ? index : null, url: index ? `https://github.com/example/project/pull/${index}` : null, fetchedAt: now },
 description: '表示確認用のモックです。\n<img src=x onerror=alert(1)>', worktreePath: null, sessionName: null, baseBranch: 'main', referencedTasks: [], blockedReason: index === 3 ? '依存タスクが未完了です' : null, escalationNote: null,
 pane: { text: '\u001b[32mテキストとして表示\u001b[0m\n<img src=x onerror=alert(1)>', capturedAt: now, lines: 2, source: 'agtx' }, paneError: null, approval: null, testResult: { status: 'not_available', source: 'pane' },
}));
export const mockState: StateResponse = {
 fetchedAt: now, agtx: { reachable: true, version: '1.0.6', tuiConnected: true },
 orchestrator: { state: 'running', target: { socket: 'default', session: 'demo', window: '0' }, paneId: '%1', currentCommand: 'codex', checkedAt: now }, tasks: mockTasks,
 attention: mockTasks.filter(task => ['approval','blocked','error','disconnected','stale'].includes(task.displayState)).map(task => ({ id: task.id, target: { kind: 'task', taskId: task.id }, kind: task.displayState as StateResponse['attention'][number]['kind'], title: task.title, reason: task.blockedReason ?? '<img src=x onerror=alert(1)>', since: now })),
};
export function createMockApi() {
 return { async apiGet<T>(path: string): Promise<T> {
  if (path === '/api/state') return structuredClone(mockState) as T;
  const task = mockTasks.find(task => path === `/api/tasks/${task.id}`);
  if (task) return structuredClone(task) as T;
  throw new HelmApiError(404,'not_found');
 } };
}
