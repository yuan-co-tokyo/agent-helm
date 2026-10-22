// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '../../src/shared/api.js';
import { App } from '../../src/web/App.js';
import { apiGet as clientGet, HelmApiError } from '../../src/web/api/client.js';
import { mockState, mockTasks } from '../../src/web/api/mock.js';
vi.mock('../../src/web/api/client.js',async importOriginal => ({...await importOriginal<object>(),apiGet:vi.fn().mockReturnValue(new Promise(()=>{}))}));
afterEach(()=> { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
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

it('shares one detail poller and clears the previous task on switching',async()=> {
 vi.useFakeTimers();
 const first = mockTasks[0]!, second = mockTasks[1]!;
 const get = vi.fn((path:string)=>path === '/api/state' ? Promise.resolve(mockState) : path === `/api/tasks/${first.id}` ? Promise.resolve(first) : new Promise(()=>{}));
 render(<App api={{getSession:session,apiGet:get as never}} />);
 await act(async()=>{});
 fireEvent.click(screen.getAllByRole('button',{name:first.title})[0]!);
 await act(async()=>{});
 for (let tick=0;tick<3;tick++) await act(async()=>{ await vi.advanceTimersByTimeAsync(1500); });
 expect(get.mock.calls.filter(([path])=>path === `/api/tasks/${first.id}`)).toHaveLength(4);
 expect(vi.mocked(clientGet).mock.calls.filter(([path])=>path.startsWith('/api/tasks/'))).toHaveLength(0);
 fireEvent.click(screen.getAllByRole('button',{name:second.title})[0]!);
 await act(async()=>{});
 expect(screen.getByRole('heading',{name:second.title})).toBeTruthy();
 expect(screen.queryByLabelText('ペイン出力')).toBeNull();
 expect(screen.queryByRole('heading',{name:first.title})).toBeNull();
});
