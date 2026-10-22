import { describe, expect, it } from 'vitest';
import { hasTmux, testSocket, waitFor } from './test-socket.js';
import { stripAnsi, stripFaint } from '../../../src/server/text.js';
import { inputState } from '../../../src/server/status/classify.js';
describe.skipIf(!hasTmux)('isolated tmux placeholder styles', () => {
 it.each(['2','90','38;5;245'])('preserves SGR %s in capture-pane -e', async code => {
  const socket = testSocket();
  try {
   await socket.runner.run(['new-session','-d','-s','helm','-n','orch','-x','100','-y','20',`printf '› \\033[${code}mplaceholder\\033[0m'; exec cat`]);
   let raw = '';
   await waitFor(async () => { raw = await socket.runner.run(['capture-pane','-e','-p','-t','=helm:=orch']); return raw.includes('placeholder'); });
   expect(raw).toContain('\x1b[');
   expect(stripFaint(raw)).not.toBeNull();
   expect(inputState(stripAnsi(raw),stripFaint(raw))).toBe('empty');
  } finally { await socket.close(); }
 });
});
