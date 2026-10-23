import { createApprovalDetector } from './approval/adapter.js';
import { serve } from '@hono/node-server';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { assertLoopbackListen, loadConfig } from './config.js';
import type { HelmConfig } from './config.js';
import { checkAgtxVersion } from './agtx/http-gateway.js';
import type { AgtxGateway } from './agtx/types.js';
import type { OrchestratorAdapter } from './orchestrator/types.js';
import { HttpAgtxDirectory, MockAgtxDirectory } from './agtx/directory.js';
import { ProjectRegistry } from './projects/registry.js';
import { createLogger } from './log.js';
import { generateCsrfToken } from './security.js';
export async function startServer(opts: { config?: HelmConfig; env?: NodeJS.ProcessEnv; gateway?: AgtxGateway; orchestrator?: OrchestratorAdapter } = {}) {
 const config = structuredClone(opts.config ?? loadConfig({ env: opts.env }));
 assertLoopbackListen(config.listen.host);
 const logger = createLogger();
 const directory = opts.gateway ? new MockAgtxDirectory([await opts.gateway.resolveProject()],() => opts.gateway!.getHealth()) : new HttpAgtxDirectory(config.agtx);
 const registry = new ProjectRegistry({ config, directory, gatewayFactory: opts.gateway ? () => opts.gateway! : undefined, orchestratorFactory: opts.orchestrator ? () => opts.orchestrator! : undefined, approvalDetector: createApprovalDetector('task') });
 try { checkAgtxVersion(await directory.getHealth(),logger); } catch { logger.warn('agtx_health_unavailable'); }
 try { await registry.list(); } catch { logger.warn('agtx_project_unavailable'); }
 const csrfToken = generateCsrfToken();
 // Port 0 is allowed for explicitly injected test configurations only.
 let app = createApp({ config, registry, approvalDetector: createApprovalDetector('task'), csrfToken, logger, appVersion: '0.1.0', staticRoot: fileURLToPath(new URL('../../web',import.meta.url)) });
 const server = serve({ fetch: (...args) => app.fetch(...args), hostname: config.listen.host, port: config.listen.port });
 const port = await new Promise<number>((resolve,reject) => {
  server.once('error',reject);
  server.once('listening',() => {
   server.off('error',reject);
   const address = server.address();
   if (!address || typeof address === 'string') { reject(new Error('Invalid server address')); return; }
   config.listen.port = address.port;
   app = createApp({ config, registry, approvalDetector: createApprovalDetector('task'), csrfToken, logger, appVersion: '0.1.0', staticRoot: fileURLToPath(new URL('../../web',import.meta.url)) });
   resolve(address.port);
  });
 });
 return { port, close: () => new Promise<void>((resolve,reject) => { server.close(e => e ? reject(e) : resolve()); }) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 startServer().then(server => {
  const close = () => { void server.close().catch(() => { process.exitCode = 1; }); };
  process.once('SIGINT',close); process.once('SIGTERM',close);
 }).catch(() => { createLogger().error('startup_failed'); process.exitCode = 1; });
}
