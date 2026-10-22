import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { PrInfo } from '../../shared/api.js';
import type { PrLookup } from './types.js';
type Runner = (file: string, args: string[], opts: { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8'; cwd?: string }) => Promise<{ stdout: string }>;
const prUrl = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/;
const responseSchema = z.object({ state: z.enum(['OPEN','CLOSED','MERGED']), isDraft: z.boolean(),
 reviewDecision: z.enum(['','APPROVED','REVIEW_REQUIRED','CHANGES_REQUESTED']).nullable(), mergedAt: z.string().nullable() });
const listSchema = z.array(responseSchema.extend({ number: z.number().int().positive(), url: z.string(), updatedAt: z.iso.datetime() }));
function classify(data: z.infer<typeof responseSchema>): PrInfo['state'] {
 return data.state === 'MERGED' || data.mergedAt ? 'merged' : data.state === 'CLOSED' ? 'closed' :
  data.reviewDecision === 'APPROVED' ? 'approved_waiting_merge' : 'open_review_pending';
}
function safeBranch(branch: string): boolean {
 return branch.length <= 255 && branch.length > 0 && !branch.startsWith('-') && !branch.includes('..') &&
  ![...branch].some(c => /\s/.test(c) || c.charCodeAt(0) < 32 || (c.charCodeAt(0) >= 127 && c.charCodeAt(0) <= 159));
}
export class GhPrService implements PrLookup {
 private readonly run: Runner;
 private readonly now: () => number;
 private readonly ttlMs: number;
 private readonly timeoutMs: number;
 private readonly cache = new Map<string, PrInfo & { expiresAt: number }>();
 private readonly flights = new Map<string, Promise<void>>();
 constructor(opts: { run?: Runner; now?: () => number; ttlMs?: number; timeoutMs?: number } = {}) {
  this.run = opts.run ?? promisify(execFile); this.now = opts.now ?? Date.now;
  this.ttlMs = opts.ttlMs ?? 60_000; this.timeoutMs = opts.timeoutMs ?? 5_000;
 }
 async lookup(url: string | null, number: number | null, opts: Parameters<PrLookup['lookup']>[2] = {}): Promise<PrInfo> {
  const branch = opts.branch;
  const fallback: PrInfo = { url, number, state: !url && number === null && !branch ? 'none' : 'unknown', fetchedAt: null };
  if (url ? !prUrl.test(url) : !branch || !safeBranch(branch) || !opts.cwd || !isAbsolute(opts.cwd)) return fallback;
  const key = url ?? `branch\0cwd\0${opts.cwd}\0${branch}`;
  const result = (info: PrInfo): PrInfo => ({ url: url ?? info.url, number: url ? number : info.number, state: info.state, fetchedAt: info.fetchedAt });
  const cached = this.cache.get(key);
  if (cached && cached.expiresAt > this.now()) return result(cached);
  let flight = this.flights.get(key);
  if (!flight) {
   flight = this.refresh(key, url, number, branch!, opts.cwd!).finally(() => { this.flights.delete(key); });
   this.flights.set(key, flight);
  }
  if (opts.wait === false) return cached ? result(cached) : fallback;
  await flight;
  return result(this.cache.get(key)!);
 }
 private async refresh(key: string, url: string | null, number: number | null, branch: string, cwd: string): Promise<void> {
  let info: PrInfo = { url, number, state: 'unknown', fetchedAt: null };
  try {
   const args = url ? ['pr','view',url,'--json','state,isDraft,reviewDecision,mergedAt'] :
    ['pr','list','--head',branch,'--state','all','--json','number,url,state,isDraft,reviewDecision,mergedAt,updatedAt','--limit','10'];
   const { stdout } = await this.run('gh', args, { shell: false, timeout: this.timeoutMs,
    maxBuffer: (url ? 64 : 256) * 1024, encoding: 'utf8', ...(url ? {} : { cwd }) });
   if (url) info.state = classify(responseSchema.parse(JSON.parse(stdout)));
   else {
    const all = listSchema.parse(JSON.parse(stdout));
    const candidates = all.filter(pr => prUrl.test(pr.url));
    candidates.sort((a,b) => Number(classify(b) === 'merged') - Number(classify(a) === 'merged') || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    const selected = candidates[0];
    if (selected) info = { url: selected.url, number: selected.number, state: classify(selected), fetchedAt: null };
    else if (!all.length) info = { url: null, number: null, state: 'none', fetchedAt: null };
   }
  } catch { /* Missing gh, authentication, invalid output and timeouts all degrade to unknown. */ }
  const now = this.now();
  this.cache.set(key, { ...info, fetchedAt: new Date(now).toISOString(), expiresAt: now + this.ttlMs });
 }
}
