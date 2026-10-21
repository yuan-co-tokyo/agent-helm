import { startMockAgtx } from './server.js';
const index = process.argv.indexOf('--port');
const port = index === -1 ? 8787 : Number(process.argv[index + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid --port');
const server = await startMockAgtx({ port });
console.log('Mock agtx listening at ' + server.url);
const close = () => { void server.close(); };
process.once('SIGINT',close); process.once('SIGTERM',close);
