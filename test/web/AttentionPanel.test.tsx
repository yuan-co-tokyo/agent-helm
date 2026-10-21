// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
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
