import { createServer } from 'node:http';
import { projectFixture, taskFixture, TASK_ID } from './fixtures.js';
export interface MockState {
 health: unknown; projects: unknown[]; tasks: Record<string, unknown>[]; panes: Record<string,unknown>;
 overrides: Record<string,{ status?: number; body?: unknown; delayMs?: number; raw?: string }>;
}
export async function startMockAgtx(opts: { port?: number } = {}) {
 const state: MockState = {
  health: { version: '1.0.6', mode: 'standalone', project_count: 1, tui_connected: true },
  projects: [structuredClone(projectFixture)], tasks: [structuredClone(taskFixture)],
  panes: { [TASK_ID]: { content: 'Hello' } }, overrides: {}
 };
 const requests: { method: string; path: string; body: unknown }[] = [];
 const timers = new Set<ReturnType<typeof setTimeout>>();
 const server = createServer(async (req,res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const method = req.method ?? 'GET';
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch { body = undefined; }
  requests.push({ method, path: url.pathname + url.search, body });
  const override = state.overrides[method + ' ' + url.pathname];
  const reply = (status: number, value: unknown, raw?: string) => {
   if (!res.destroyed) { res.writeHead(status,{ 'Content-Type': 'application/json' }); res.end(raw ?? JSON.stringify(value)); }
  };
  if (override) {
   const send = () => reply(override.status ?? 200,override.body,override.raw);
   if (override.delayMs) {
    const timer = setTimeout(() => { timers.delete(timer); send(); },override.delayMs);
    timers.add(timer);
   } else send();
   return;
  }
  if (method === 'GET' && url.pathname === '/api/health') return reply(200,state.health);
  if (method === 'GET' && url.pathname === '/api/projects') return reply(200,state.projects);
  const match = /^\/api\/projects\/([^/]+)\/tasks(?:\/([^/]+))?(?:\/(pane|input))?$/.exec(url.pathname);
  if (!match) return reply(405,{ error: 'unsupported' });
  if (!(state.projects as { id?: string }[]).some(p => p.id === match[1])) return reply(404,{ error: 'project not found' });
  const id = match[2]; const action = match[3];
  if (method === 'GET' && !id) return reply(200,state.tasks);
  const task = state.tasks.find(t => t.id === id);
  if (!task) return reply(404,{ error: 'task not found' });
  if (method === 'GET' && !action) return reply(200,task);
  if (method === 'GET' && action === 'pane') return id && id in state.panes ? reply(200,state.panes[id]) : reply(404,{ error: 'no session' });
  if (method === 'POST' && action === 'input') return reply(task.status === 'done' ? 409 : 200,{ delivered: task.status !== 'done' });
  return reply(405,{ error: 'unsupported' });
 });
 await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(opts.port ?? 0,'127.0.0.1',resolve); });
 const address = server.address();
 if (!address || typeof address === 'string') throw new Error('Invalid mock address');
 return { port: address.port, url: 'http://127.0.0.1:' + address.port, state, requests,
  close: () => new Promise<void>((resolve,reject) => {
   for (const timer of timers) clearTimeout(timer);
   server.close(e => e ? reject(e) : resolve()); server.closeAllConnections();
  })
 };
}
