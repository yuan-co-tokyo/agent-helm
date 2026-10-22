import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_INSTRUCTION_MAX_CHARS } from '../shared/constants.js';

export class ConfigError extends Error {}
export function assertLoopbackListen(host: string): asserts host is '127.0.0.1' | '::1' {
 if (host !== '127.0.0.1' && host !== '::1') throw new ConfigError('listen.host must be 127.0.0.1 or ::1');
}
export function isLoopbackUrl(value: string): boolean {
 try {
  const u = new URL(value);
  return u.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(u.hostname) && !u.username && !u.password && !u.search && !u.hash && u.pathname === '/';
 } catch { return false; }
}
// Dots are excluded: tmux interprets them as pane target separators.
const target = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
export const configSchema = z.object({
 listen: z.object({ host: z.enum(['127.0.0.1','::1']).default('127.0.0.1'), port: z.number().int().min(1).max(65535).default(8790) }).strict().default({ host: '127.0.0.1', port: 8790 }),
 agtx: z.object({
  baseUrl: z.string().refine(isLoopbackUrl, 'must be an HTTP loopback root URL').transform(v => new URL(v).origin).default('http://127.0.0.1:8787'),
  projectName: z.string().trim().min(1), timeoutMs: z.number().int().min(100).max(60000).default(5000)
 }).strict(),
 orchestrator: z.object({ tmuxSocket: target, session: target, window: target }).strict(),
 limits: z.object({ instructionMaxChars: z.number().int().min(1).max(100000).default(DEFAULT_INSTRUCTION_MAX_CHARS) }).strict().default({ instructionMaxChars: DEFAULT_INSTRUCTION_MAX_CHARS })
}).strict();
export type HelmConfig = z.infer<typeof configSchema>;
export function loadConfig({ env = process.env, cwd = process.cwd(), readFile = (p: string) => readFileSync(p, 'utf8') }: {
 env?: NodeJS.ProcessEnv; cwd?: string; readFile?: (path: string) => string;
} = {}): HelmConfig {
 let raw: unknown = {};
 try { raw = JSON.parse(readFile(resolve(cwd, env.AGENT_HELM_CONFIG ?? 'agent-helm.config.json'))); }
 catch (e) {
  if (env.AGENT_HELM_CONFIG || !(e instanceof Error && 'code' in e && e.code === 'ENOENT')) throw new ConfigError('Cannot read configuration JSON');
 }
 if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ConfigError('Configuration must be an object');
 const data = raw as Record<string, unknown>;
 const overrides: [string, string, string, boolean?][] = [
  ['listen','port','AGENT_HELM_PORT',true], ['agtx','baseUrl','AGTX_BASE_URL'], ['agtx','projectName','AGTX_PROJECT'],
  ['orchestrator','tmuxSocket','AGENT_HELM_TMUX_SOCKET'], ['orchestrator','session','AGENT_HELM_TMUX_SESSION'], ['orchestrator','window','AGENT_HELM_TMUX_WINDOW']
 ];
 for (const [section,key,name,numeric] of overrides) {
  const value = env[name];
  if (value === undefined) continue;
  const existing = data[section];
  if (existing !== undefined && (!existing || typeof existing !== 'object' || Array.isArray(existing))) throw new ConfigError(section + ' must be an object');
  data[section] = { ...(existing as object | undefined), [key]: numeric ? Number(value) : value };
 }
 const result = configSchema.safeParse(data);
 if (!result.success) throw new ConfigError(result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; '));
 return result.data;
}
