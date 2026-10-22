import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorBody, SendResult } from '../../shared/api.js';
export interface StoredResponse { status: ContentfulStatusCode; body: SendResult | (ApiErrorBody & { option?: { key: string; label: string } }) }
export class RequestStore {
 private entries = new Map<string,{ promise: Promise<StoredResponse>; expires: number; pending: boolean }>();
 constructor(private now = Date.now, private capacity = 500, private ttlMs = 600_000) {}
 get(id: string) { this.prune(); return this.entries.get(id)?.promise; }
 private prune() {
  for (const [id,entry] of this.entries) if (!entry.pending && entry.expires <= this.now()) this.entries.delete(id);
 }
 hasCapacity() {
  this.prune();
  if (this.entries.size < this.capacity) return true;
  for (const [id,entry] of this.entries) {
   if (!entry.pending) { this.entries.delete(id); return true; }
  }
  return false;
 }
 set(id: string, promise: Promise<StoredResponse>) {
  if (!this.entries.has(id) && !this.hasCapacity()) throw new Error('Request store is full');
  const entry = { promise, expires: Infinity, pending: true };
  this.entries.set(id,entry);
  void promise.finally(() => {
   entry.pending = false; entry.expires = this.now() + this.ttlMs;
   for (const [key,value] of this.entries) {
    if (this.entries.size <= this.capacity) break;
    if (!value.pending) this.entries.delete(key);
   }
  }).catch(() => {});
 }
}
export class TargetLocks {
 private targets = new Set<string>();
 acquire(target: string) { if (this.targets.has(target)) return false; this.targets.add(target); return true; }
 release(target: string) { this.targets.delete(target); }
}
