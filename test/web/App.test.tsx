// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '../../src/shared/api.js';
import { App } from '../../src/web/App.js';
import { HelmApiError } from '../../src/web/api/client.js';
import { mockState, mockTasks } from '../../src/web/api/mock.js';
afterEach(cleanup);
const session = () => Promise.reject(new Error('offline')) as Promise<SessionResponse>;
describe('App', () => {
 it('does not claim empty lists when state cannot be fetched', async () => {
  const api = { getSession: session, apiGet: vi.fn().mockRejectedValue(new HelmApiError(0,'network')) };
  render(<App api={api} />);
  await act(async () => {});
  expect(screen.queryByText('タスクなし')).toBeNull();
  expect(screen.queryByText('要対応なし')).toBeNull();
  expect(screen.getByText('タスク一覧を取得できません')).toBeTruthy();
  expect(screen.getByText('サーバーに接続できません')).toBeTruthy();
 });
 it('opens the task detail for a selected task', async () => {
  const task = mockTasks[0]!;
  const apiGet = vi.fn((path: string) => Promise.resolve(path === '/api/state' ? mockState : task));
  render(<App api={{ getSession: session, apiGet: apiGet as never }} />);
  await act(async () => {});
  fireEvent.click(screen.getAllByRole('button',{ name: task.title })[0]!);
  await act(async () => {});
  expect(apiGet).toHaveBeenCalledWith(`/api/tasks/${task.id}`);
  expect(screen.getByRole('heading',{ name: task.title })).toBeTruthy();
  expect(screen.getByLabelText('ペイン出力').textContent).not.toContain('\u001b');
 });
});
