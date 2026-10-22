import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { PrInfo } from '../../shared/api.js';
import type { PrLookup } from './types.js';
type Runner = (file: string, args: string[], opts: { shell: false; timeout: number; maxBuffer: number; encoding: 'utf8' }) => Promise<{ stdout: string }>;
const responseSchema = z.object({ state: z.enum(['OPEN','CLOSED','MERGED']), isDraft: z.boolean(),
 reviewDecision: z.enum(['','APPROVED','REVIEW_REQUIRED','CHANGES_REQUESTED']).nullable(), mergedAt: z.string().nullable() });
export class GhPrService implements PrLookup {
 private readonly run: Runner;
 private readonly now: () => number;
 private readonly ttlMs: number;
 private readonly timeoutMs: number;
 private readonly cache = new Map<string, { state: PrInfo['state']; fetchedAt: string; expiresAt: number }>();
 private readonly flights = new Map<string, Promise<void>>();
 constructor(opts: { run?: Runner; now?: () => number; ttlMs?: number; timeoutMs?: number } = {}) {
  this.run = opts.run ?? promisify(execFile); this.now = opts.now ?? Date.now;
  this.ttlMs = opts.ttlMs ?? 60_000; this.timeoutMs = opts.timeoutMs ?? 5_000;
 }
 async lookup(url: string | null, number: number | null, opts: { wait?: boolean } = {}): Promise<PrInfo> {
  const fallback: PrInfo = { url, number, state: !url && number === null ? 'none' : 'unknown', fetchedAt: null };
  if (!url || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(url)) return fallback;
  const cached = this.cache.get(url);
  if (cached && cached.expiresAt > this.now()) return { url, number, state: cached.state, fetchedAt: cached.fetchedAt };
  let flight = this.flights.get(url);
  if (!flight) {
   flight = this.refresh(url).finally(() => { this.flights.delete(url); });
   this.flights.set(url, flight);
  }
  if (opts.wait === false) return cached ? { url, number, state: cached.state, fetchedAt: cached.fetchedAt } : fallback;
  await flight;
  const result = this.cache.get(url)!;
  return { url, number, state: result.state, fetchedAt: result.fetchedAt };
 }
 private async refresh(url: string): Promise<void> {
  let state: PrInfo['state'] = 'unknown';
  try {
   const { stdout } = await this.run('gh', ['pr','view',url,'--json','state,isDraft,reviewDecision,mergedAt'],
    { shell: false, timeout: this.timeoutMs, maxBuffer: 64 * 1024, encoding: 'utf8' });
   const data = responseSchema.parse(JSON.parse(stdout));
   state = data.state === 'MERGED' || data.mergedAt ? 'merged' : data.state === 'CLOSED' ? 'closed' :
    data.reviewDecision === 'APPROVED' ? 'approved_waiting_merge' : 'open_review_pending';
  } catch { /* Missing gh, authentication, invalid output and timeouts all degrade to unknown. */ }
  const now = this.now();
  this.cache.set(url, { state, fetchedAt: new Date(now).toISOString(), expiresAt: now + this.ttlMs });
 }
}
