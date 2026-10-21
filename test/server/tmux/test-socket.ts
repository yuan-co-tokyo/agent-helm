import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { ExecFileTmuxRunner } from '../../../src/server/tmux/exec.js';
export const hasTmux = (() => { try { execFileSync('tmux',['-V']); return true; } catch { return false; } })();
export function testSocket() {
 const socket = `agent-helm-test-${randomUUID().slice(0,8)}`;
 if (!socket.startsWith('agent-helm-test-') || socket.includes('agtx')) throw new Error('Unsafe test socket');
 const runner = new ExecFileTmuxRunner(socket);
 return { socket, runner, async startSession(script: string, out: string) { await runner.run(['new-session','-d','-s','helm','-n','orch','-x','200','-y','50',process.execPath,script,out]); }, async close() { try { await runner.run(['kill-server']); } catch { /* Already stopped. */ } } };
}
export async function waitFor(predicate: () => Promise<boolean>) {
 const deadline = Date.now() + 5000;
 while (Date.now() < deadline) { if (await predicate()) return; await delay(25); }
 throw new Error('Timed out waiting for test pane');
}
