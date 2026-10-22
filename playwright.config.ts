import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: 'test/e2e',
 projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 800 } } }, { name: 'mobile', use: { viewport: { width: 390, height: 844 } } }],
 use: { baseURL: 'http://127.0.0.1:8791' },
 webServer: { command: 'pnpm build && node dist/server/server/index.js', url: 'http://127.0.0.1:8791', env: { AGENT_HELM_CONFIG: 'test/e2e/agent-helm.e2e.json' } }
});
