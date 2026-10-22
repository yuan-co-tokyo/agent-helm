// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskDetailView } from '../../src/shared/api.js';
import { TaskDetail } from '../../src/web/components/TaskDetail.js';
afterEach(cleanup);
const detail: TaskDetailView = { id: '00000000-0000-0000-0000-000000000001', title: 'Example', status: 'running', agent: null, phaseStatus: 'blocked', agentState: null, phaseAgeSecs: null, displayState: 'blocked', attentionReason: null, depsSatisfied: true, blockingTasks: [], cycle: 1, branchName: null, pr: { url: null, number: null, state: 'merged', fetchedAt: null }, updatedAt: null, description: '<img src=x onerror=alert(1)>', worktreePath: null, sessionName: null, baseBranch: null, referencedTasks: [], blockedReason: 'Reason', escalationNote: null, pane: { text: '\u001b[31mhello\u001b[0m', capturedAt: '2026-01-01T00:00:00Z', lines: 1, source: 'agtx' }, paneError: null, approval: null, testResult: { status: 'not_available', source: 'pane' } };
describe('TaskDetail', () => {
 it('renders safely and keeps test results unavailable', () => {
  render(<TaskDetail taskId={detail.id} detail={detail} connected onClose={vi.fn()} lastSuccessAt={null} error={null} />);
  expect(screen.getByText(detail.description!)).toBeTruthy();
  expect(screen.getByText('未取得（出典: ペイン） · pane')).toBeTruthy();
  expect(screen.getByLabelText('ペイン出力').textContent).toBe('hello');
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByLabelText('承認')).toBeTruthy();
 });
});

it('explains invalid IDs without loading or mounting approval',()=> {
 const renderApproval = vi.fn();
 render(<TaskDetail taskId="invalid" detail={null} connected={false} onClose={vi.fn()} lastSuccessAt={null} error={null} renderApproval={renderApproval} />);
 expect(screen.getByText('不正なタスクIDです')).toBeTruthy(); expect(screen.queryByText('取得中…')).toBeNull(); expect(renderApproval).not.toHaveBeenCalled();
});
it('shows terminal guidance before the pane',()=> {
 render(<TaskDetail taskId={detail.id} detail={{...detail,approval:{terminalOnly:true,agentKind:'claude',kind:'trust',question:'Trust?',detail:null,options:[],capturedAt:'now',fingerprint:'a'}}} connected onClose={vi.fn()} lastSuccessAt={null} error={null} renderApproval={()=>null} />);
 expect(screen.getByText('この確認は端末（agtx TUI）で操作してください')).toBeTruthy();
});
