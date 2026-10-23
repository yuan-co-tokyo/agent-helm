// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AttentionItem } from '../../src/shared/api.js';
import { AttentionPanel } from '../../src/web/components/AttentionPanel.js';
afterEach(cleanup);
const item: AttentionItem = { id: '1', target: { kind: 'task', taskId: 'id' }, kind: 'blocked', title: 'Task', reason: 'Waiting', since: null };
describe('AttentionPanel', () => {
 it('shows attention items and avoids claiming none while stale', () => {
  const { rerender } = render(<AttentionPanel items={[item]} stale={false} />);
  expect(screen.getByText(/ブロック中/)).toBeTruthy();
  rerender(<AttentionPanel items={[]} stale />);
  expect(screen.queryByText('要対応なし')).toBeNull();
  expect(screen.getByText('最新状態を取得できていません')).toBeTruthy();
 });
});

it('places approval requests before other attention items', () => {
 render(<AttentionPanel items={[item, {...item, id:'approval', kind:'approval', title:'Approve deployment'}]} stale={false} />);
 const groups = screen.getAllByRole('group');
 expect(groups[0]?.getAttribute('aria-label')).toBe('承認待ち');
 expect(within(groups[0]!).getByRole('button', {name:'Approve deployment'})).toBeTruthy();
 expect(within(groups[1]!).getByRole('button', {name:'Task'})).toBeTruthy();
});
