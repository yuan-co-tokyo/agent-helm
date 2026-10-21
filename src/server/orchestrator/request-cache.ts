import { createHash } from 'node:crypto';
export class RequestConflict extends Error {}
export class RequestCache<T> {
 private entries = new Map<string,{ textHash: string; promise: Promise<T> }>();
 constructor(private limit = 500) {}
 run(id: string, text: string, action: () => Promise<T>): Promise<T> {
  const textHash = createHash('sha256').update(text).digest('hex');
  const existing = this.entries.get(id);
  if (existing) {
   if (existing.textHash !== textHash) throw new RequestConflict('requestId already used');
   return existing.promise;
  }
  const promise = Promise.resolve().then(action);
  this.entries.set(id,{ textHash, promise });
  if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  return promise;
 }
}
