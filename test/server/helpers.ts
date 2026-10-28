import { readFileSync } from 'node:fs';
import { loadConfig } from '../../src/server/config.js';
import { type AppDeps, createApp } from '../../src/server/app.js';
import { MockAgtxGateway } from '../../src/server/agtx/mock-gateway.js';
import { MockOrchestratorAdapter } from '../../src/server/orchestrator/mock-adapter.js';
import { createLogger } from '../../src/server/log.js';
export const example = { ...JSON.parse(readFileSync('agent-helm.config.example.json','utf8')), agtx: { baseUrl: 'http://127.0.0.1:8787', projectName: 'agent-helm' }, orchestrator: { tmuxSocket: 'agtx', session: 'agent-helm', window: 'orchestrator' }, orchestrators: {} };
export const config = () => loadConfig({ env: {}, readFile: () => JSON.stringify(example) });
import { MockAgtxDirectory } from '../../src/server/agtx/directory.js';
import { ProjectRegistry } from '../../src/server/projects/registry.js';
import { StatusService } from '../../src/server/status/service.js';
import type { ApprovalDetector } from '../../src/server/status/types.js';
export function makeApp(input?: string | { staticRoot?: string; approval?: AppDeps['approval'] }, options: { statusService?: StatusService; approvalDetector?: ApprovalDetector | null } = {}) {
 const { staticRoot, approval } = typeof input === 'string' ? { staticRoot: input, approval: undefined } : input ?? {};
 const logs: string[] = [];
 const gateway = new MockAgtxGateway();
 const orchestrator = new MockOrchestratorAdapter();
 const statusService = options.statusService ?? new StatusService({ gateway, orchestrator, detector: options.approvalDetector, pr: { async lookup(url, number) { return { url, number, state: url || number !== null ? 'unknown' : 'none', fetchedAt: null }; } } });
 const directory = new MockAgtxDirectory([gateway.project],() => gateway.getHealth());
 const registry = new ProjectRegistry({ config: config(), directory, gatewayFactory: () => gateway, orchestratorFactory: () => orchestrator, statusFactory: () => statusService });
 const app = createApp({ config: config(), registry, approval, approvalDetector: options.approvalDetector, csrfToken: 'test-csrf-secret', appVersion: '0.1.0', logger: createLogger(line => logs.push(line)), staticRoot });
 return { app, logs, gateway, orchestrator, registry, directory };
}
export const headers = { host: '127.0.0.1:8790', origin: 'http://127.0.0.1:8790', 'x-helm-csrf': 'test-csrf-secret', 'content-type': 'application/json' };
