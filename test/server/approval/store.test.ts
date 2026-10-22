import { expect, it } from 'vitest';
import { RequestStore, TargetLocks, type StoredResponse } from '../../../src/server/approval/store.js';
const result: StoredResponse = { status: 200, body: { requestId: 'test', outcome: 'sent' } };
it('expires completed requests and evicts oldest completed entries',async () => {
 let now = 0; const store = new RequestStore(() => now,2,10);
 for (const id of ['a','b','c']) { store.set(id,Promise.resolve(result)); await Promise.resolve(); }
 expect(store.get('a')).toBeUndefined(); expect(store.get('b')).toBeDefined();
 now = 11; expect(store.get('b')).toBeUndefined(); expect(store.get('c')).toBeUndefined();
});
it('retains pending requests across TTL and capacity pressure',async () => {
 let now = 0; const store = new RequestStore(() => now,1,10); const pending = deferred<StoredResponse>();
 store.set('a',pending.promise); now = 100; expect(store.hasCapacity()).toBe(false);
 expect(() => store.set('b',Promise.resolve(result))).toThrow('Request store is full');
 expect(store.get('a')).toBe(pending.promise); pending.resolve(result); await pending.promise;
 now = 111; expect(store.get('a')).toBeUndefined();
});
it('locks targets independently and supports release',() => {
 const locks = new TargetLocks(); expect(locks.acquire('task:a')).toBe(true); expect(locks.acquire('task:a')).toBe(false);
 expect(locks.acquire('orchestrator')).toBe(true); locks.release('task:a'); expect(locks.acquire('task:a')).toBe(true);
});

function deferred<T>() {
 let resolve!: (value: T | PromiseLike<T>) => void;
 const promise = new Promise<T>(done => { resolve = done; });
 return { promise, resolve };
}
