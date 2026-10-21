import { readFileSync } from 'node:fs';
import { loadConfig } from '../../src/server/config.js';
import { createApp } from '../../src/server/app.js';
import { MockAgtxGateway } from '../../src/server/agtx/mock-gateway.js';
import { MockOrchestratorAdapter } from '../../src/server/orchestrator/mock-adapter.js';
import { createLogger } from '../../src/server/log.js';
export const example = JSON.parse(readFileSync('agent-helm.config.example.json','utf8'));
export const config = () => loadConfig({ env: {}, readFile: () => JSON.stringify(example) });
export function makeApp(staticRoot?: string) {
 const logs: string[] = [];
 const gateway = new MockAgtxGateway();
 const app = createApp({ config: config(), gateway, orchestrator: new MockOrchestratorAdapter(), csrfToken: 'test-csrf-secret', appVersion: '0.1.0', logger: createLogger(line => logs.push(line)), staticRoot });
 return { app, logs, gateway };
}
export const headers = { host: '127.0.0.1:8790', origin: 'http://127.0.0.1:8790', 'x-helm-csrf': 'test-csrf-secret', 'content-type': 'application/json' };
