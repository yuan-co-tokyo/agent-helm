import { z } from 'zod';
import type { AgtxKey, PaneSnapshot } from '../../shared/api.js';
import { SUPPORTED_AGTX_VERSION } from '../../shared/constants.js';
import { isLoopbackUrl } from '../config.js';
import type { Logger } from '../log.js';
import { stripAnsi } from '../text.js';
import { GatewayError } from './types.js';
import type { AgtxGateway, AgtxHealth, ProjectRef, KeySendResult } from './types.js';
import { assertTaskId, clampLines, detailSchema, healthSchema, isAgtxKey, paneSchema, parseResponse, projectSchema, summarySchema } from './schemas.js';

export class HttpAgtxGateway implements AgtxGateway {
 cachedProject: ProjectRef | null = null;
 lastHealth: AgtxHealth | null = null;
 private projectFetchedAt = 0;
 private readonly fetcher: typeof fetch;
 private readonly now: () => number;
 constructor(private readonly options: { baseUrl: string; projectName: string; timeoutMs: number; fetch?: typeof fetch; now?: () => number }) {
  if (!isLoopbackUrl(options.baseUrl)) throw new Error('agtx.baseUrl must be a loopback HTTP root URL');
  this.fetcher = options.fetch ?? fetch; this.now = options.now ?? Date.now;
 }
 private async request(method: 'GET'|'POST', path: string, body?: object): Promise<unknown> {
  try {
   const response = await this.fetcher(this.options.baseUrl.replace(/\/$/,'') + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
   });
   if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) this.cachedProject = null;
    throw new GatewayError(response.status === 404 ? 'not_found' : response.status === 409 ? 'conflict' : 'unknown',response.status);
   }
   // Read the entire response before declaring an input sent; read failures are ambiguous.
   const text = await response.text();
   if (method === 'POST' && !text.trim()) return null;
   try { return JSON.parse(text) as unknown; } catch { throw new GatewayError('bad_response'); }
  } catch (e) {
   if (e instanceof GatewayError) throw e;
   if (e instanceof Error && ['TimeoutError','AbortError'].includes(e.name)) throw new GatewayError('timeout');
   throw new GatewayError('unreachable');
  }
 }
 async getHealth() {
  const v = parseResponse(healthSchema, await this.request('GET','/api/health'));
  this.lastHealth = { version: v.version, mode: v.mode, projectCount: v.project_count, tuiConnected: v.tui_connected, fetchedAt: new Date(this.now()).toISOString() };
  return this.lastHealth;
 }
 async resolveProject() {
  if (this.cachedProject && this.now() - this.projectFetchedAt < 60000) return this.cachedProject;
  this.cachedProject = null;
  const projects = parseResponse(z.array(projectSchema),await this.request('GET','/api/projects'));
  const matches = projects.filter(p => p.name === this.options.projectName);
  if (!matches.length) throw new GatewayError('project_not_found');
  if (matches.length !== 1) throw new GatewayError('project_ambiguous');
  this.cachedProject = matches[0]!;
  this.projectFetchedAt = this.now();
  return this.cachedProject;
 }
 private async taskPath(id?: string) {
  if (id !== undefined) assertTaskId(id);
  const project = await this.resolveProject();
  return '/api/projects/' + encodeURIComponent(project.id) + '/tasks' + (id === undefined ? '' : '/' + encodeURIComponent(id));
 }
 async listTasks() { return parseResponse(z.array(summarySchema),await this.request('GET',await this.taskPath())); }
 async getTask(id: string) { return parseResponse(detailSchema,await this.request('GET',await this.taskPath(id))); }
 async readPane(id: string, lines = 200): Promise<PaneSnapshot> {
  const count = clampLines(lines);
  const text = parseResponse(paneSchema, await this.request('GET',await this.taskPath(id) + '/pane?lines=' + count));
  return { text: stripAnsi(text), capturedAt: new Date(this.now()).toISOString(), lines: count, source: 'agtx' };
 }
 async sendKey(id: string, key: AgtxKey): Promise<KeySendResult> {
  if (!isAgtxKey(key)) return { outcome: 'rejected', reason: 'key_not_allowed' };
  assertTaskId(id);
  // Resolve before sending: failures here cannot represent a dispatched input.
  let path: string;
  try { path = await this.taskPath(id); } catch (e) {
   const kind = e instanceof GatewayError ? e.kind : 'unknown';
   return { outcome: ['project_not_found','project_ambiguous','not_found'].includes(kind) ? 'rejected' : 'unknown', reason: kind };
  }
  try {
   const body = z.object({ delivered: z.boolean() }).safeParse(await this.request('POST',path + '/input',{ key }));
   if (!body.success) return { outcome: 'unknown', reason: 'bad_response' };
   return body.data.delivered ? { outcome: 'sent' } : { outcome: 'rejected', reason: 'not_delivered' };
  }
  catch (e) {
   const err = e instanceof GatewayError ? e : new GatewayError('unknown');
   return { outcome: err.status && err.status >= 400 && err.status < 500 ? 'rejected' : 'unknown', reason: err.kind };
  }
 }
}
export function checkAgtxVersion(health: AgtxHealth, logger?: Logger): boolean {
 const supported = health.version === SUPPORTED_AGTX_VERSION;
 if (!supported) logger?.warn('agtx_version_mismatch', { supported: SUPPORTED_AGTX_VERSION, actual: health.version });
 return supported;
}
