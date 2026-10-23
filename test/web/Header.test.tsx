// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionResponse, StateResponse } from '../../src/shared/api.js';
import { Header } from '../../src/web/components/Header.js';
afterEach(cleanup);
const session: SessionResponse = { csrfToken: 'x', target: { fixedProjectName: 'Demo' }, versions: { app: '1', agtxSupported: '1.0.6', agtx: '0.9' } };
const state: StateResponse = { project: { id: '11111111-1111-4111-8111-111111111111', name: 'Demo' }, fetchedAt: '2026-01-01T00:00:00Z', agtx: { reachable: false, version: '0.9', tuiConnected: false }, orchestrator: { state: 'not_found', target: { socket: 'x', session: 's', window: '0' }, paneId: null, currentCommand: null, checkedAt: '2026-01-01T00:00:00Z' }, tasks: [], attention: [] };
describe('Header', () => {
 it('shows connectivity, version warning and last success during disconnect', () => {
  render(<Header project={{id:"11111111-1111-4111-8111-111111111111",name:"Demo"}} session={session} state={state} connected={false} lastSuccessAt={new Date('2026-01-01T00:00:00Z')} />);
  expect(screen.getByText(/agtx: 到達不可/)).toBeTruthy();
  expect(screen.getByText(/TUI: 未接続/)).toBeTruthy();
  expect(screen.getByText(/Orchestrator: 見つかりません/)).toBeTruthy();
  expect(screen.getByText('agtx バージョン 0.9 は未検証（対応: 1.0.6）')).toBeTruthy();
  expect(screen.getByText(/切断中・最終取得/)).toBeTruthy();
 });
});
it('shows an unknown TUI when agtx health is unavailable',()=> {
 render(<Header project={{id:"11111111-1111-4111-8111-111111111111",name:"Demo"}} session={session} state={{...state,agtx:{...state.agtx,tuiConnected:null}}} connected={false} lastSuccessAt={null} />);
 expect(screen.getByText(/TUI: 不明/)).toBeTruthy();
});
