import { z } from 'zod';
import { HttpClient } from './http-client.js';
import { healthSchema, parseResponse, projectSchema } from './schemas.js';
import type { AgtxDirectory, AgtxHealth, ProjectRef } from './types.js';
export class HttpAgtxDirectory implements AgtxDirectory {
 lastHealth: AgtxHealth | null = null;
 private client: HttpClient;
 constructor(options: { baseUrl: string; timeoutMs: number; fetch?: typeof fetch }) { this.client = new HttpClient(options); }
 async getHealth() {
  const value = parseResponse(healthSchema,await this.client.request('GET','/api/health'));
  return this.lastHealth = { version: value.version, mode: value.mode, projectCount: value.project_count, tuiConnected: value.tui_connected, fetchedAt: new Date().toISOString() };
 }
 async listProjects() { return parseResponse(z.array(projectSchema),await this.client.request('GET','/api/projects')); }
}
export class MockAgtxDirectory implements AgtxDirectory {
 lastHealth: AgtxHealth | null = null;
 constructor(public projects: ProjectRef[], private health: () => Promise<AgtxHealth>) {}
 async getHealth() { this.lastHealth = await this.health(); return this.lastHealth; }
 async listProjects() { return this.projects; }
}
