import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startMockAgtx } from '../mock-agtx/server.js';
import { TASK_ID, taskFixture, PROJECT_ID, PROJECT_B_ID } from '../mock-agtx/fixtures.js';
export default async function setup() {
 const mock = await startMockAgtx({ port: 8792, multiProject: true });
 const dir = mkdtempSync(join(tmpdir(), 'agent-helm-e2e-'));
 const tmux = (...args: string[]) => execFileSync('tmux', ['-L', 'agent-helm-test', ...args]);
 const control = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (req.method === 'POST') {
   const body = JSON.parse(Buffer.concat(chunks).toString());
   if (body.reset) { mock.requests.length = 0; mock.state.overrides = {}; mock.state.tasks = [{ ...taskFixture, agent_state: 'exited', phase_status: null }]; }
   if (typeof body.pane === 'string') { const panes = !body.projectId || body.projectId === PROJECT_ID ? mock.state.panes : mock.state.panesByProject[body.projectId]; if (panes) panes[TASK_ID] = { content: body.pane }; }
   if (body.reset) mock.state.tasksByProject[PROJECT_B_ID] = [{ ...taskFixture, title: 'Playground task', agent_state: 'exited', phase_status: null }];
   if (body.offline) mock.state.overrides['GET /api/health'] = { status: 503, body: {} };
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(mock.requests.filter(r => r.method === 'POST')));
 });
 try {
  // Fail on an occupied test session instead of killing another test run.
  tmux('new-session', '-d', '-s', 'agent-helm', '-n', 'orchestrator', '-x', '160', '-y', '40', process.execPath, resolve('test/fixtures/prompt-app.mjs'), join(dir, 'input.jsonl'));
  tmux('new-session', '-d', '-s', 'agtx-playground', '-n', 'orchestrator', '-x', '160', '-y', '40', process.execPath, resolve('test/fixtures/prompt-app.mjs'), join(dir, 'playground-input.jsonl'));
  await new Promise<void>((ok, fail) => { control.once('error', fail); control.listen(8793, '127.0.0.1', ok); });
 } catch (error) { await mock.close(); throw error; }
 return async () => {
  control.closeAllConnections();
  await new Promise<void>(ok => control.close(() => ok()));
  await mock.close();
  try { tmux('kill-server'); } finally { rmSync(dir, { recursive: true, force: true }); }
 };
}
