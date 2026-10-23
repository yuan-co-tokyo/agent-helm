// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionResponse } from '../../src/shared/api.js';
import { App } from '../../src/web/App.js';
import { apiGet as clientGet, HelmApiError } from '../../src/web/api/client.js';
import { mockState, mockTasks } from '../../src/web/api/mock.js';
vi.mock('../../src/web/api/client.js',async importOriginal => ({...await importOriginal<object>(),apiGet:vi.fn().mockReturnValue(new Promise(()=>{}))}));
afterEach(()=> { cleanup(); vi.clearAllMocks(); vi.useRealTimers(); });
beforeEach(() => { location.hash = '#/p/11111111-1111-4111-8111-111111111111'; });
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
  const apiGet = vi.fn((path: string) => Promise.resolve(path === '/api/projects/11111111-1111-4111-8111-111111111111/state' ? mockState : task));
  render(<App api={{ getSession: session, apiGet: apiGet as never }} />);
  await act(async () => {});
  fireEvent.click(screen.getAllByRole('button',{ name: task.title })[0]!);
  await act(async () => {});
  expect(apiGet).toHaveBeenCalledWith(`/api/projects/11111111-1111-4111-8111-111111111111/tasks/${task.id}`);
  expect(screen.getByRole('heading',{ name: task.title })).toBeTruthy();
  expect(screen.getByLabelText('ペイン出力').textContent).not.toContain('\u001b');
 });
});

it('shares one detail poller and clears the previous task on switching',async()=> {
 vi.useFakeTimers();
 const first = mockTasks[0]!, second = mockTasks[1]!;
 const get = vi.fn((path:string)=>path === '/api/projects/11111111-1111-4111-8111-111111111111/state' ? Promise.resolve(mockState) : path === `/api/projects/11111111-1111-4111-8111-111111111111/tasks/${first.id}` ? Promise.resolve(first) : new Promise(()=>{}));
 render(<App api={{getSession:session,apiGet:get as never}} />);
 await act(async()=>{});
 fireEvent.click(screen.getAllByRole('button',{name:first.title})[0]!);
 await act(async()=>{});
 for (let tick=0;tick<3;tick++) await act(async()=>{ await vi.advanceTimersByTimeAsync(1500); });
 expect(get.mock.calls.filter(([path])=>path === `/api/projects/11111111-1111-4111-8111-111111111111/tasks/${first.id}`)).toHaveLength(4);
 expect(vi.mocked(clientGet).mock.calls.filter(([path])=>path.startsWith('/api/projects/11111111-1111-4111-8111-111111111111/tasks/'))).toHaveLength(0);
 fireEvent.click(screen.getAllByRole('button',{name:second.title})[0]!);
 await act(async()=>{});
 expect(screen.getByRole('heading',{name:second.title})).toBeTruthy();
 expect(screen.queryByLabelText('ペイン出力')).toBeNull();
 expect(screen.queryByRole('heading',{name:first.title})).toBeNull();
});

it('drops task details when switching projects and rejects responses for the old project', async () => {
 const task = mockTasks[0]!;
 const otherId = '33333333-3333-4333-8333-333333333333';
 const get = vi.fn((path: string) => Promise.resolve(path.endsWith('/state') ? mockState : task));
 render(<App api={{ getSession: session, apiGet: get as never }} />);
 await act(async () => {});
 fireEvent.click(screen.getAllByRole('button', { name: task.title })[0]!);
 await act(async () => {});
 expect(screen.getByRole('heading', { name: task.title })).toBeTruthy();
 await act(async () => { location.hash = '#/p/' + otherId; window.dispatchEvent(new HashChangeEvent('hashchange')); });
 expect(screen.queryByRole('dialog')).toBeNull();
 expect(screen.queryByRole('button', { name: task.title })).toBeNull();
 expect(get).toHaveBeenCalledWith(`/api/projects/${otherId}/state`);
});
it('auto-opens a sole project only for an initially empty hash and stays on the list after returning', async () => {
 location.hash = '';
 const projects = { fetchedAt: mockState.fetchedAt, agtx: mockState.agtx, mode: 'global', fixedProjectId: null, projects: [{ ...mockState.project, pathTail: 'demo', tuiConnected: true, orchestrator: { state: 'running' }, attentionCount: 0, approvalCount: 0, fetchedAt: mockState.fetchedAt }] };
 const get = vi.fn((path: string) => Promise.resolve(path === '/api/projects' ? projects : mockState));
 const getSession = async (): Promise<SessionResponse> => ({ csrfToken: 'x', target: { fixedProjectName: null }, versions: { app: '1', agtxSupported: '1.0.6', agtx: '1.0.6' } });
 render(<App api={{ getSession, apiGet: get as never }} />);
 await act(async () => {});
 expect(location.hash).toBe('#/p/' + mockState.project.id);
 await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
 fireEvent.click(screen.getByRole('link', { name: '← プロジェクト一覧' }));
 await act(async () => { window.dispatchEvent(new HashChangeEvent('hashchange')); });
 expect(location.hash).toBe('#/');
 expect(await screen.findByRole('heading', { level: 2, name: 'プロジェクト一覧' })).toBeTruthy();
});
