import { expect, it, vi } from 'vitest';
import { GhPrService } from '../../../src/server/status/pr.js';
const url = 'https://github.com/org/repo/pull/1';
const data = { state: 'OPEN', isDraft: false, reviewDecision: '', mergedAt: null };
it.each([
 [{}, 'open_review_pending'], [{ reviewDecision: 'APPROVED' }, 'approved_waiting_merge'],
 [{ reviewDecision: 'REVIEW_REQUIRED' }, 'open_review_pending'], [{ reviewDecision: 'CHANGES_REQUESTED' }, 'open_review_pending'],
 [{ isDraft: true }, 'open_review_pending'], [{ state: 'MERGED' }, 'merged'], [{ mergedAt: '2026-01-01' }, 'merged'],
 [{ state: 'CLOSED' }, 'closed'], [{ state: 'invalid' }, 'unknown']
])('maps response %j', async (patch, state) => {
 const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ ...data, ...patch }) });
 expect((await new GhPrService({ run }).lookup(url, 1)).state).toBe(state);
 expect(run).toHaveBeenCalledWith('gh', ['pr','view',url,'--json','state,isDraft,reviewDecision,mergedAt'], { shell: false, timeout: 5000, maxBuffer: 65536, encoding: 'utf8' });
});
it('avoids processes for missing or invalid URLs', async () => {
 const run = vi.fn(); const service = new GhPrService({ run });
 expect((await service.lookup(null, null)).state).toBe('none');
 for (const value of [null, '-R x', 'http://github.com/a/b/pull/1', 'https://evil.com/a/b/pull/1']) expect((await service.lookup(value, 1)).state).toBe('unknown');
 expect(run).not.toHaveBeenCalled();
});
it.each(['ENOENT','exit 1','timeout','bad json'])('caches failure %s', async failure => {
 const run = failure === 'bad json' ? vi.fn().mockResolvedValue({ stdout: '{' }) : vi.fn().mockRejectedValue(new Error(failure));
 const service = new GhPrService({ run });
 expect((await service.lookup(url, 1)).state).toBe('unknown');
 await service.lookup(url, 1); expect(run).toHaveBeenCalledTimes(1);
});
it('expires cache precisely at 60 seconds', async () => {
 let now = 0; const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(data) });
 const service = new GhPrService({ run, now: () => now });
 await service.lookup(url, 1); now = 59999; await service.lookup(url, 1); expect(run).toHaveBeenCalledTimes(1);
 now = 60000; await service.lookup(url, 1); expect(run).toHaveBeenCalledTimes(2);
});
it('returns immediately for polling and shares pending work with details', async () => {
 let resolve!: (value: { stdout: string }) => void;
 const run = vi.fn(() => new Promise<{ stdout: string }>(r => { resolve = r; }));
 const service = new GhPrService({ run });
 expect(await service.lookup(url, 1, { wait: false })).toMatchObject({ state: 'unknown', fetchedAt: null });
 const first = service.lookup(url, 1); const second = service.lookup(url, 2);
 resolve({ stdout: JSON.stringify(data) });
 expect((await first).state).toBe('open_review_pending'); expect((await second).number).toBe(2);
 expect(run).toHaveBeenCalledTimes(1);
});
