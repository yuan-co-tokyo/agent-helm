// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePolling } from '../../src/web/hooks/usePolling.js';
afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(document,'visibilityState',{ configurable: true, value: 'visible' }); });
function Probe({ fetcher }: { fetcher: () => Promise<string> }) {
 const result = usePolling(fetcher,{ intervalMs: 3000 });
 return <output>{JSON.stringify({ data: result.data, connected: result.connected, failures: result.failures })}</output>;
}
describe('usePolling', () => {
 it('fetches immediately then at the interval', async () => {
  const fetcher = vi.fn().mockResolvedValue('ok');
  render(<Probe fetcher={fetcher} />);
  await act(async () => {});
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('keeps prior data after failure and backs off with a cap', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce('saved').mockRejectedValue(new Error('offline'));
  render(<Probe fetcher={fetcher} />);
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(screen.getByText('{"data":"saved","connected":false,"failures":1}')).toBeTruthy();
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(fetcher).toHaveBeenCalledTimes(3);
 });
 it('stops while hidden, refreshes on visibility, and clears work on unmount', async () => {
  const fetcher = vi.fn().mockResolvedValue('ok');
  const view = render(<Probe fetcher={fetcher} />);
  await act(async () => {});
  Object.defineProperty(document,'visibilityState',{ configurable: true, value: 'hidden' });
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  Object.defineProperty(document,'visibilityState',{ configurable: true, value: 'visible' });
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(fetcher).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
 });
});
