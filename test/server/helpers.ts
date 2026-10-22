import { readFileSync } from 'node:fs';
import { loadConfig } from '../../src/server/config.js';
import { type AppDeps, createApp } from '../../src/server/app.js';
import { MockAgtxGateway } from '../../src/server/agtx/mock-gateway.js';
import { MockOrchestratorAdapter } from '../../src/server/orchestrator/mock-adapter.js';
import { createLogger } from '../../src/server/log.js';
export const example = JSON.parse(readFileSync('agent-helm.config.example.json','utf8'));
export const config = () => loadConfig({ env: {}, readFile: () => JSON.stringify(example) });
import { StatusService } from '../../src/server/status/service.js';
import type { ApprovalDetector } from '../../src/server/status/types.js';
export function makeApp(input?: string | { staticRoot?: string; approval?: AppDeps['approval'] }, options: { statusService?: StatusService; approvalDetector?: ApprovalDetector | null } = {}) {
 const { staticRoot, approval } = typeof input === 'string' ? { staticRoot: input, approval: undefined } : input ?? {};
 const logs: string[] = [];
 const gateway = new MockAgtxGateway();
 const orchestrator = new MockOrchestratorAdapter();
 const statusService = options.statusService ?? new StatusService({ gateway, orchestrator, detector: options.approvalDetector, pr: { async lookup(url, number) { return { url, number, state: url || number !== null ? 'unknown' : 'none', fetchedAt: null }; } } });
 const app = createApp({ config: config(), gateway, orchestrator, approval, statusService, approvalDetector: options.approvalDetector, csrfToken: 'test-csrf-secret', appVersion: '0.1.0', logger: createLogger(line => logs.push(line)), staticRoot });
 return { app, logs, gateway, orchestrator };
}
export const headers = { host: '127.0.0.1:8790', origin: 'http://127.0.0.1:8790', 'x-helm-csrf': 'test-csrf-secret', 'content-type': 'application/json' };
