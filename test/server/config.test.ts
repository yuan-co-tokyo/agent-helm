import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/server/config.js';
import { example } from './helpers.js';
const load = (value: unknown, env = {}) => loadConfig({ env, readFile: () => JSON.stringify(value) });
describe('config',() => {
 it('loads example and defaults',() => {
  expect(load(example).listen.port).toBe(8790);
  expect(load({ agtx: { projectName: 'demo' }, orchestrator: example.orchestrator }).limits.instructionMaxChars).toBe(8000);
 });
 it.each(['0.0.0.0','::','localhost','192.168.1.10'])('rejects host %s',host => expect(() => load({ ...example, listen: { host, port: 8790 } })).toThrow(ConfigError));
 it('allows IPv6',() => expect(load({ ...example, listen: { host: '::1', port: 8790 } }).listen.host).toBe('::1'));
 it.each(['http://192.168.1.2:8787','https://example.com','http://user:pw@127.0.0.1','http://127.0.0.1/path','http://localhost:8787','http://127.0.0.1/?x=1','http://127.0.0.1/#x'])('rejects URL %s',baseUrl => expect(() => load({ ...example, agtx: { ...example.agtx, baseUrl } })).toThrow(ConfigError));
 it('normalizes IPv6 URL',() => expect(load({ ...example, agtx: { ...example.agtx, baseUrl: 'http://[::1]:8787/' } }).agtx.baseUrl).toBe('http://[::1]:8787'));
 it.each(['bad:name','bad.name','%1','a b',''])('rejects tmux target %s',session => expect(() => load({ ...example, orchestrator: { ...example.orchestrator, session } })).toThrow(ConfigError));
 it('defaults tmux target and rejects unknown keys',() => {
  expect(load({ ...example, orchestrator: {} }).orchestrator).toEqual({ tmuxSocket: 'agtx', window: 'orchestrator' });
  expect(() => load({ ...example, typo: true })).toThrow(ConfigError);
  expect(() => load({ ...example, listen: { ...example.listen, typo: true } })).toThrow(ConfigError);
 });
 it('applies env overrides',() => {
  const value = load(example,{ AGENT_HELM_PORT: '9000', AGTX_PROJECT: 'other', AGTX_BASE_URL: 'http://[::1]:8788', AGENT_HELM_TMUX_SOCKET: 'test', AGENT_HELM_TMUX_SESSION: 'session', AGENT_HELM_TMUX_WINDOW: 'window' });
  expect(value.listen.port).toBe(9000); expect(value.agtx.projectName).toBe('other'); expect(value.orchestrator.tmuxSocket).toBe('test');
 });
 it('rejects missing explicit file and invalid JSON',() => {
  expect(() => loadConfig({ env: { AGENT_HELM_CONFIG: 'missing' }, readFile: () => { throw Object.assign(new Error(),{ code: 'ENOENT' }); } })).toThrow(ConfigError);
  expect(() => loadConfig({ env: {}, readFile: () => '{' })).toThrow(ConfigError);
 });
});

it('supports global defaults, legacy fixed configuration and per-project overrides', () => {
 expect(load({ agtx: {} }).agtx.projectName).toBeUndefined();
 expect(load(example).orchestrator.session).toBe('agent-helm');
 expect(load({ agtx: {}, orchestrators: { '日本語': { session: 'explicit' } } }).orchestrators['日本語']?.session).toBe('explicit');
 expect(() => load({ agtx: {}, orchestrator: { session: 'shared' } })).toThrow(ConfigError);
 expect(() => load({ agtx: {}, orchestrators: { demo: { session: 'bad:name' } } })).toThrow(ConfigError);
});
