// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TaskView } from '../../src/shared/api.js';
import { TaskList } from '../../src/web/components/TaskList.js';
afterEach(cleanup);
const task: TaskView = { id: 'id', title: '<img src=x onerror=alert(1)>', status: 'running', agent: null, phaseStatus: null, agentState: null, phaseAgeSecs: null, displayState: 'blocked', attentionReason: null, depsSatisfied: false, blockingTasks: ['12345678-0000-0000-0000-000000000000'], cycle: 2, branchName: null, pr: { url: 'javascript:alert(1)', number: 9, state: 'open_review_pending', fetchedAt: null }, updatedAt: null };
describe('TaskList', () => {
 it('renders state, blockers and PR and keeps task text inert', () => {
  const { container } = render(<TaskList tasks={[task]} stale={false} onSelect={vi.fn()} />);
  expect(screen.getByText(task.title)).toBeTruthy();
  expect(screen.getByText('未充足: 1件')).toBeTruthy();
  expect(screen.getByText(/PR作成済み・レビュー待ち/)).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
 });
 it('does not claim an empty list when unavailable or stale', () => {
  const { rerender } = render(<TaskList tasks={null} stale={false} />);
  expect(screen.queryByText('タスクなし')).toBeNull();
  rerender(<TaskList tasks={[]} stale />);
  expect(screen.queryByText('タスクなし')).toBeNull();
  rerender(<TaskList tasks={[]} stale={false} />);
  expect(screen.getByText('タスクなし')).toBeTruthy();
 });
});

it('groups tasks by workflow status and counts each column', () => {
 render(<TaskList tasks={[task, {...task, id:'plan', title:'Plan next step', status:'planning'}, {...task, id:'done', title:'Finished task', status:'done'}]} stale={false} />);
 const planning = within(screen.getByRole('region', {name:'計画'}));
 expect(planning.getByRole('button', {name:'Plan next step'})).toBeTruthy();
 expect(planning.queryByRole('button', {name:task.title})).toBeNull();
 expect(planning.getByLabelText('1件')).toBeTruthy();
 expect(within(screen.getByRole('region', {name:'実行'})).getByRole('button', {name:task.title})).toBeTruthy();
 expect(within(screen.getByRole('region', {name:'完了'})).getByRole('button', {name:'Finished task'})).toBeTruthy();
 expect(within(screen.getByRole('region', {name:'バックログ'})).getByLabelText('0件')).toBeTruthy();
});
