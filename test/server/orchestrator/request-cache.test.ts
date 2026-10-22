import { expect, it } from 'vitest';
import { RequestCache, RequestConflict } from '../../../src/server/orchestrator/request-cache.js';
it('shares pending promises, rejects conflicts and evicts oldest entries',async () => {
 const cache = new RequestCache<number>(2); let calls = 0;
 const action = async () => ++calls;
 const first = cache.run('a','text',action);
 expect(cache.run('a','text',action)).toBe(first);
 expect(() => cache.run('a','different',action)).toThrow(RequestConflict);
 expect(await first).toBe(1);
 await cache.run('b','text',action); await cache.run('c','text',action);
 expect(await cache.run('a','text',action)).toBe(4);
});
