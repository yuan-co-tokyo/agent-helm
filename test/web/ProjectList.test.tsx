// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectList } from '../../src/web/components/ProjectList.js';
import type { ProjectsResponse } from '../../src/shared/api.js';
const result: ProjectsResponse = { fetchedAt: '2026-01-01T00:00:00Z', agtx: { reachable: true, version: '1.0.6', tuiConnected: true }, mode: 'global', fixedProjectId: null, projects: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Demo', pathTail: 'demo', tuiConnected: false, orchestrator: { state: 'not_found', reason: 'session_unresolved' }, attentionCount: 2, approvalCount: 1, fetchedAt: '2026-01-01T00:00:00Z' }] };
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('links a complete card and shows disconnected TUI and highlighted approvals', async () => {
 render(<ProjectList api={{ apiGet: vi.fn().mockResolvedValue(result) }} />);
 const link = await screen.findByRole('link');
 expect(link.getAttribute('href')).toBe('#/p/' + result.projects[0]!.id);
 expect(link.textContent).toContain('TUI未接続');
 expect(link.textContent).toContain('demo');
 expect(link.textContent).toContain('要対応: 2');
 expect(link.querySelector('.badge--warning')?.textContent).toBe('承認: 1');
});
it('retains the previous cards and marks them stale after a failed poll', async () => {
 vi.useFakeTimers();
 const get = vi.fn().mockResolvedValueOnce(result).mockRejectedValue(new Error('offline'));
 render(<ProjectList api={{ apiGet: get }} />);
 await act(async () => {});
 await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
 expect(screen.getByRole('link').textContent).toContain('Demo');
 expect(screen.getByRole('alert').textContent).toContain('古い情報');
});
