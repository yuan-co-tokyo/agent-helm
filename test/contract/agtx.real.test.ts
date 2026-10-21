import { expect, it } from 'vitest';
import { HttpAgtxGateway } from '../../src/server/agtx/http-gateway.js';
it.skipIf(process.env.AGTX_CONTRACT !== '1')('reads real agtx contract (GET only)',async () => {
 const gateway = new HttpAgtxGateway({
  baseUrl: process.env.AGTX_BASE_URL ?? 'http://127.0.0.1:8787',
  projectName: process.env.AGTX_PROJECT ?? 'agent-helm', timeoutMs: 5000
 });
 expect((await gateway.getHealth()).version).toBeTruthy();
 expect((await gateway.resolveProject()).id).toBeTruthy();
 expect(Array.isArray(await gateway.listTasks())).toBe(true);
});
