import { GatewayError } from './types.js';
import { isLoopbackUrl } from '../config.js';
export class HttpClient {
 private readonly fetcher: typeof fetch;
 constructor(private readonly options: { baseUrl: string; timeoutMs: number; fetch?: typeof fetch }) {
 if (!isLoopbackUrl(options.baseUrl)) throw new Error('agtx.baseUrl must be a loopback HTTP root URL');
 this.fetcher = options.fetch ?? fetch;
 }
 async request(method: 'GET'|'POST', path: string, body?: object): Promise<unknown> {
  try {
   const response = await this.fetcher(this.options.baseUrl.replace(/\/$/,'') + path, {
    method, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs),
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
   });
   if (!response.ok) {
    await response.body?.cancel();
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
}
