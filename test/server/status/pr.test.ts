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
const branchOpts = { branch: 'feature/日本語', cwd: '/tmp/project' };
const candidate = (number: number, patch = {}) => ({ ...data, number, url: `https://github.com/org/repo/pull/${number}`, updatedAt: '2026-10-22T00:00:00Z', ...patch });
it.each([
 [[candidate(8, { state: 'CLOSED', updatedAt: '2026-10-23T00:00:00Z' }), candidate(9, { state: 'MERGED' })], 9, 'merged'],
 [[candidate(8), candidate(9, { updatedAt: '2026-10-23T00:00:00Z', reviewDecision: 'APPROVED' })], 9, 'approved_waiting_merge'],
 [[candidate(8, { state: 'MERGED' }), candidate(9, { mergedAt: '2026-10-23', updatedAt: '2026-10-23T00:00:00Z' })], 9, 'merged'],
 [[], null, 'none'], [[candidate(8, { url: 'https://evil.test/pull/8' })], null, 'unknown']
])('selects branch PR from %j', async (list, number, state) => {
 const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(list) });
 const result = await new GhPrService({ run }).lookup(null, null, branchOpts);
 expect(result).toMatchObject({ number, state, url: number ? `https://github.com/org/repo/pull/${number}` : null });
 expect(run).toHaveBeenCalledWith('gh', ['pr','list','--head','feature/日本語','--state','all','--json','number,url,state,isDraft,reviewDecision,mergedAt,updatedAt','--limit','10'],
  { cwd: '/tmp/project', shell: false, timeout: 5000, maxBuffer: 262144, encoding: 'utf8' });
});
it('rejects unsafe branch and cwd and preserves URL priority', async () => {
 const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(data) }); const service = new GhPrService({ run });
 for (const branch of ['-R x','a\nb','a..b','a b','x'.repeat(256)]) expect((await service.lookup(null, null, { ...branchOpts, branch })).state).toBe('unknown');
 for (const cwd of [null,'relative']) expect((await service.lookup(null,null,{ ...branchOpts,cwd })).state).toBe('unknown');
 await service.lookup('-R x', null, branchOpts); expect(run).not.toHaveBeenCalled();
 expect((await service.lookup(url,1,branchOpts)).state).toBe('open_review_pending');
 expect(run.mock.calls[0]?.[1]).toContain('view');
});
it.each(['{', '{}', '[{}]', 'failure'])('caches branch failures: %s', async output => {
 const run = output === 'failure' ? vi.fn().mockRejectedValue(new Error('timeout')) : vi.fn().mockResolvedValue({ stdout: output });
 const service = new GhPrService({ run });
 expect((await service.lookup(null,null,branchOpts)).state).toBe('unknown');
 await service.lookup(null,null,branchOpts); expect(run).toHaveBeenCalledTimes(1);
});
it('shares branch flights, expires TTL, and isolates repositories', async () => {
 let now = 0; let resolve!: (value: { stdout: string }) => void;
 const run = vi.fn(() => new Promise<{ stdout: string }>(r => { resolve = r; }));
 const service = new GhPrService({ run, now: () => now });
 expect((await service.lookup(null,null,{ ...branchOpts,wait:false })).fetchedAt).toBeNull();
 const pending = service.lookup(null,null,branchOpts);
 resolve({ stdout: JSON.stringify([candidate(9)]) }); await pending;
 expect((await service.lookup(null,null,branchOpts)).number).toBe(9); expect(run).toHaveBeenCalledTimes(1);
 now = 60000;
 expect((await service.lookup(null,null,{ ...branchOpts,wait:false })).number).toBe(9);
 resolve({ stdout: '[]' }); await service.lookup(null,null,branchOpts);
 expect(run).toHaveBeenCalledTimes(2);
 const other = service.lookup(null,null,{ ...branchOpts,cwd:'/tmp/other' }); resolve({ stdout:'[]' }); await other;
 expect(run).toHaveBeenCalledTimes(3);
});
