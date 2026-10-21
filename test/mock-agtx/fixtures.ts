export const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
export const TASK_ID = '22222222-2222-4222-8222-222222222222';
export const projectFixture = { id: PROJECT_ID, name: 'agent-helm', path: '/tmp/agent-helm', last_opened: '2026-01-01T00:00:00Z', tui_connected: true };
export const taskFixture = {
 id: TASK_ID, title: 'Build foundation', status: 'running', agent: 'codex', plugin: null, cycle: 1,
 branch_name: 'task/foundation', pr_number: null, escalation_note: null, updated_at: '2026-01-01T00:00:00Z',
 deps_satisfied: true, allowed_actions: ['review'], phase_status: 'working', phase_age_secs: 2,
 conflicted: false, conflicting_files: [], description: 'Foundation task', worktree_path: '/tmp/agent-helm-task',
 session_name: 'test-session', pr_url: null, base_branch: 'main', referenced_tasks: [],
 created_at: '2026-01-01T00:00:00Z', agent_state: 'working', blocked_reason: null, blocking_tasks: [],
 project_id: 'agent-helm', tui_connected: true
};
