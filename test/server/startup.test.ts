import { createServer, connect } from 'node:net';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { startServer } from '../../src/server/index.js';
import { MockAgtxGateway } from '../../src/server/agtx/mock-gateway.js';
import { config } from './helpers.js';
async function unusedPort() {
 const server = createServer();
 await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
 const address = server.address();
 if (!address || typeof address === 'string') throw new Error('address');
 await new Promise<void>(resolve => server.close(() => resolve()));
 return address.port;
}
async function expectClosed(port: number) {
 const code = await new Promise<string>(resolve => {
  const socket = connect({ host: '127.0.0.1', port });
  socket.on('connect',() => { socket.destroy(); resolve('connected'); });
  socket.on('error',(err: NodeJS.ErrnoException) => resolve(err.code ?? 'unknown'));
 });
 expect(code).toBe('ECONNREFUSED');
}
it('rejects injected non-loopback configuration before opening port',async () => {
 const value = config(); const port = await unusedPort();
 value.listen = { host: '0.0.0.0' as '127.0.0.1', port };
 await expect(startServer({ config: value, gateway: new MockAgtxGateway() })).rejects.toThrow('listen.host');
 await expectClosed(port);
});
it('rejects unsafe file configuration before opening port',async () => {
 const dir = await mkdtemp(join(tmpdir(),'helm-config-')); const port = await unusedPort();
 try {
  const value = config(); value.listen = { host: '0.0.0.0' as '127.0.0.1', port };
  const path = join(dir,'config.json'); await writeFile(path,JSON.stringify(value));
  await expect(startServer({ env: { AGENT_HELM_CONFIG: path } })).rejects.toThrow('listen.host');
  await expectClosed(port);
 } finally { await rm(dir,{ recursive: true }); }
});
it('starts on ephemeral loopback port, responds and closes',async () => {
 const value = config(); value.listen.port = 0;
 const server = await startServer({ config: value, gateway: new MockAgtxGateway() });
 try {
  const response = await fetch('http://127.0.0.1:' + server.port + '/api/session');
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ versions: { agtx: '1.0.6' } });
  await expect(startServer({ config: { ...value, listen: { ...value.listen, port: server.port } }, gateway: new MockAgtxGateway() })).rejects.toMatchObject({ code: 'EADDRINUSE' });
 } finally { await server.close(); }
 await expectClosed(server.port);
});
