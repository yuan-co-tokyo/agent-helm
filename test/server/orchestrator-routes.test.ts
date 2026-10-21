import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { headers, makeApp } from './helpers.js';
it('maps screen status and validates line counts',async () => {
 const { app,orchestrator } = makeApp();
 for (const [state,status] of [['running',200],['not_found',404],['ambiguous',409],['error',502]] as const) { orchestrator.status.state = state; expect((await app.request('/api/orchestrator/screen',{ headers })).status).toBe(status); }
 expect((await app.request('/api/orchestrator/screen?lines=no',{ headers })).status).toBe(400);
});
it('validates requests and preserves CSRF protection',async () => {
 const { app } = makeApp();
 for (const body of [{ text: 'ok',requestId: 'bad' },{ text: 1,requestId: randomUUID() },...['','\0','\r'].map(text => ({ text,requestId: randomUUID() }))]) expect((await app.request('/api/orchestrator/instructions',{ method: 'POST',headers,body: JSON.stringify(body) })).status).toBe(400);
 expect((await app.request('/api/orchestrator/instructions',{ method: 'POST',headers,body: '{' })).status).toBe(400);
 expect((await app.request('/api/orchestrator/instructions',{ method: 'POST',headers,body: JSON.stringify({ text: 'a'.repeat(8001),requestId: randomUUID() }) })).status).toBe(413);
 expect((await app.request('/api/orchestrator/instructions',{ method: 'POST',headers: { ...headers,'x-helm-csrf': '' },body: '{}' })).status).toBe(403);
});
it('deduplicates pending and completed requests and rejects mismatched text',async () => {
 const { app,orchestrator } = makeApp(); let release!: () => void;
 const pending = new Promise<void>(r => { release = r; });
 const send = vi.spyOn(orchestrator,'sendInstruction').mockImplementation(async () => { await pending; return { outcome: 'unknown' }; });
 const requestId = randomUUID();
 const post = (text: string) => app.request('/api/orchestrator/instructions',{ method: 'POST',headers,body: JSON.stringify({ text,requestId }) });
 const a = post('hello'); const b = post('hello'); release();
 expect(await (await a).json()).toEqual(await (await b).json()); expect((await post('hello')).status).toBe(200); expect(send).toHaveBeenCalledTimes(1);
 expect((await post('different')).status).toBe(409);
});
