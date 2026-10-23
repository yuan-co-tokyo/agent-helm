import { createHash } from 'node:crypto';
export class RequestConflict extends Error {}
export class RequestCache<T> {
 private entries = new Map<string,{ textHash: string; promise: Promise<T>; pending: boolean }>();
 constructor(private limit = 500) {}
 run(id: string, text: string, action: () => Promise<T>): Promise<T> {
  const textHash = createHash('sha256').update(text).digest('hex');
  const existing = this.entries.get(id);
  if (existing) {
   if (existing.textHash !== textHash) throw new RequestConflict('requestId already used');
   return existing.promise;
  }
  if (this.entries.size >= this.limit) {
   const idle = [...this.entries].find(([,entry]) => !entry.pending);
   if (!idle) throw new RequestConflict('request_capacity');
   this.entries.delete(idle[0]);
  }
  const promise = Promise.resolve().then(action);
  const entry = { textHash, promise, pending: true };
  this.entries.set(id,entry);
  void promise.finally(() => { entry.pending = false; }).catch(() => {});
  return promise;
 }
}
