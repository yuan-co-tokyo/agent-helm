import { execFile } from 'node:child_process';
export interface TmuxRunner { run(args: string[], opts?: { input?: string; timeoutMs?: number }): Promise<string> }
export class TmuxError extends Error {
 constructor(public kind: 'timeout'|'no_server'|'not_found'|'failed') { super(`tmux ${kind}`); }
}
export class ExecFileTmuxRunner implements TmuxRunner {
 constructor(private socket: string, private options: { bin?: string; timeoutMs?: number } = {}) {
  if (!/^[A-Za-z0-9_-]+$/.test(socket)) throw new Error('Invalid tmux socket');
 }
 run(args: string[], opts: { input?: string; timeoutMs?: number } = {}): Promise<string> {
  return new Promise((resolve,reject) => {
   const child = execFile(this.options.bin ?? 'tmux',['-L',this.socket,...args],{ timeout: opts.timeoutMs ?? this.options.timeoutMs ?? 3000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, TMUX: undefined } },(error,stdout,stderr) => {
    if (!error) { resolve(stdout); return; }
    reject(new TmuxError(error.killed && error.signal ? 'timeout' : /no server running|error connecting/.test(stderr) ? 'no_server' : /can't find (session|window|pane)/.test(stderr) ? 'not_found' : 'failed'));
   });
   child.stdin?.on('error',() => { /* The process callback reports the failure. */ });
   child.stdin?.end(opts.input,'utf8');
  });
 }
}
