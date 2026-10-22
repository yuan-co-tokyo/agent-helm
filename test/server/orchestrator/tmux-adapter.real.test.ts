import { mkdtemp, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TmuxOrchestratorAdapter } from '../../../src/server/orchestrator/tmux-adapter.js';
import { hasTmux, testSocket, waitFor } from '../tmux/test-socket.js';
import { adapterContract } from './adapter.contract.js';
describe.skipIf(!hasTmux)('isolated real tmux',() => {
 const sockets: ReturnType<typeof testSocket>[] = []; const dirs: string[] = [];
 afterEach(async () => { for (const socket of sockets.splice(0)) await socket.close(); for (const dir of dirs.splice(0)) await rm(dir,{ recursive: true, force: true }); });
 async function setup() {
  const socket = testSocket(); sockets.push(socket); const dir = await mkdtemp(join(tmpdir(),'helm-')); dirs.push(dir); const out = join(dir,'out');
  await socket.startSession(resolve('test/fixtures/prompt-app.mjs'),out);
  const adapter = new TmuxOrchestratorAdapter({ socket: socket.socket, session: 'helm', window: 'orch' },{ settleMs: 0 });
  await waitFor(async () => (await adapter.inspectScreen()).inputReady.ok);
  return { socket,dir,out,adapter };
 }
 it('preserves literal multilingual multiline input and sends exactly one Enter',async () => {
  const { adapter,dir,out } = await setup();
  const text = `日本語\n$ \x60 " ' ; | & \\ $(touch ${dir}/pwned)`;
  expect((await adapter.sendInstruction(text)).outcome).toBe('sent');
  await waitFor(async () => { try { return (await readFile(out,'utf8')).includes('enters'); } catch { return false; } });
  expect((await readFile(out,'utf8')).trim().split('\n').map(line => JSON.parse(line))).toEqual([{ text,enters: 1 }]);
  await expect(access(join(dir,'pwned'))).rejects.toThrow();
 });
 it('satisfies the shared contract and rejects occupied input',async () => {
  const { adapter,socket } = await setup();
  await adapterContract(adapter,async () => { await socket.runner.run(['send-keys','-t','=helm:=orch','-l','abc']); await waitFor(async () => (await adapter.inspectScreen()).inputReady.reason === 'input_not_empty'); });
 });
 it('requires an exact unique live target',async () => {
  const { adapter,socket } = await setup();
  const absent = new TmuxOrchestratorAdapter({ socket: socket.socket,session: 'hel',window: 'orc' });
  expect((await absent.getStatus()).state).toBe('not_found');
  await socket.runner.run(['split-window','-d','-t','=helm:=orch']); expect((await adapter.getStatus()).state).toBe('ambiguous');
  await socket.close(); expect((await adapter.getStatus()).state).toBe('not_found');
 });
 it('pastes literally into a non bracketed-paste cat process',async () => {
  const { adapter,socket,dir,out } = await setup();
  await socket.runner.run(['respawn-pane','-k','-t','=helm:=orch',`printf '❯ '; exec cat > '${out}'`]);
  await waitFor(async () => (await adapter.inspectScreen()).inputReady.ok);
  const text = `日本語\n$(touch ${dir}/pwned) ; | &`;
  expect((await adapter.sendInstruction(text)).outcome).toBe('sent');
  await waitFor(async () => { try { return (await readFile(out,'utf8')) === text + '\n'; } catch { return false; } });
  await expect(access(join(dir,'pwned'))).rejects.toThrow();
 });
});
