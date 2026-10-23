import { z } from 'zod';
import type { AgtxKey } from '../../shared/api.js';
import { SUPPORTED_AGTX_VERSION } from '../../shared/constants.js';
import { HttpClient } from './http-client.js';
import type { Logger } from '../log.js';
import type { AgtxPane } from './types.js';
import { stripAnsi, stripFaint } from '../text.js';
import { GatewayError } from './types.js';
import type { AgtxGateway, AgtxHealth, ProjectRef, KeySendResult } from './types.js';
import { assertTaskId, clampLines, detailSchema, healthSchema, isAgtxKey, paneSchema, parseResponse, projectSchema, summarySchema } from './schemas.js';

export class HttpAgtxGateway implements AgtxGateway {
 cachedProject: ProjectRef | null = null;
 lastHealth: AgtxHealth | null = null;
 private projectFetchedAt = 0;
 private readonly client: HttpClient;
 private readonly now: () => number;
 constructor(private readonly options: { baseUrl: string; projectName?: string; projectId?: string; timeoutMs: number; fetch?: typeof fetch; now?: () => number }) {
  this.client = new HttpClient(options); this.now = options.now ?? Date.now;
 }
 private async request(method: 'GET'|'POST', path: string, body?: object) { try { return await this.client.request(method,path,body); } catch (e) { if (e instanceof GatewayError && e.status === 404) this.cachedProject = null; throw e; } }
 async listProjects() { return parseResponse(z.array(projectSchema),await this.request('GET','/api/projects')); }
 async getHealth() {
  const v = parseResponse(healthSchema, await this.request('GET','/api/health'));
  this.lastHealth = { version: v.version, mode: v.mode, projectCount: v.project_count, tuiConnected: v.tui_connected, fetchedAt: new Date(this.now()).toISOString() };
  return this.lastHealth;
 }
 async resolveProject() {
  if (!this.options.projectId && this.cachedProject && this.now() - this.projectFetchedAt < 60000) return this.cachedProject;
  this.cachedProject = null;
  const projects = await this.listProjects();
  const matches = projects.filter(p => this.options.projectId ? p.id === this.options.projectId : p.name === this.options.projectName);
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
 async readPane(id: string, lines = 200): Promise<AgtxPane> {
  const count = clampLines(lines);
  const text = parseResponse(paneSchema, await this.request('GET',await this.taskPath(id) + '/pane?lines=' + count));
  return { text: stripAnsi(text), inputText: stripFaint(text), capturedAt: new Date(this.now()).toISOString(), lines: count, source: 'agtx' };
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
