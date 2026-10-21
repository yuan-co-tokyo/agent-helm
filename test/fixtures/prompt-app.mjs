import { appendFileSync } from 'node:fs';
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdout.write('\x1b[?2004h❯ ');
let pending = ''; let text = ''; let pasting = false; let enters = 0;
process.stdin.on('data',chunk => {
 pending += chunk;
 while (pending) {
  if (pending.startsWith('\x1b[200~')) { pasting = true; pending = pending.slice(6); continue; }
  if (pending.startsWith('\x1b[201~')) { pasting = false; pending = pending.slice(6); continue; }
  if (pending.startsWith('\x1b') && pending.length < 6) break;
  const char = pending[0]; pending = pending.slice(1);
  if (!pasting && char === '\r') {
   appendFileSync(process.argv[2],JSON.stringify({ text, enters: ++enters }) + '\n'); text = ''; process.stdout.write('\r\n❯ ');
  } else {
   // Terminal editors normalize tmux's CR line separators inside bracketed paste.
   text += pasting && char === '\r' ? '\n' : char; process.stdout.write(char);
  }
 }
});
