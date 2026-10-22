import { expect, it } from 'vitest';
import { HttpAgtxGateway } from '../../src/server/agtx/http-gateway.js';
it.skipIf(process.env.AGTX_CONTRACT !== '1')('reads real agtx contract (GET only)',async () => {
 const gateway = new HttpAgtxGateway({
  baseUrl: process.env.AGTX_BASE_URL ?? 'http://127.0.0.1:8787',
  projectName: process.env.AGTX_PROJECT ?? 'agent-helm', timeoutMs: 5000
 });
 expect((await gateway.getHealth()).version).toBeTruthy();
 expect((await gateway.resolveProject()).id).toBeTruthy();
 const tasks = await gateway.listTasks();
 expect(Array.isArray(tasks)).toBe(true);
 if (tasks[0]) expect((await gateway.getTask(tasks[0].id)).id).toBe(tasks[0].id);
 const active = tasks.find(task => ['planning','running','review'].includes(task.status));
 if (active) {
  const detail = await gateway.getTask(active.id);
  if (detail.sessionName) {
   const pane = await gateway.readPane(active.id, 200);
   expect(typeof pane.text).toBe('string');
   expect(pane.text).not.toContain(String.fromCharCode(27) + '[');
   expect(pane.source).toBe('agtx');
   expect(Number.isNaN(Date.parse(pane.capturedAt))).toBe(false);
  }
 }
});
