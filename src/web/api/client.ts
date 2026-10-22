import type { ApiErrorBody, SessionResponse } from '../../shared/api.js';
import { CSRF_HEADER } from '../../shared/constants.js';
export class HelmApiError extends Error {
 constructor(public readonly status: number, public readonly code: string) { super(code); this.name = 'HelmApiError'; }
}
export function createApiClient(fetcher: typeof fetch = fetch) {
 let token: string | null = null;
 async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith('/api/') || path.includes('\\')) throw new HelmApiError(0,'bad_request');
  let response: Response;
  try { response = await fetcher(path,{ ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error' }); }
  catch { throw new HelmApiError(0,'network'); }
  let data: unknown;
  try { data = await response.json(); } catch { throw new HelmApiError(response.status,'bad_response'); }
  if (!response.ok) {
   const code = (data as Partial<ApiErrorBody> | null)?.error?.code;
   throw new HelmApiError(response.status,typeof code === 'string' ? code : 'internal');
  }
  return data as T;
 }
 async function getSession(): Promise<SessionResponse> {
  const session = await request<SessionResponse>('/api/session');
  token = session.csrfToken;
  return session;
 }
 async function apiGet<T>(path: string): Promise<T> { return request<T>(path); }
 async function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (!token) await getSession();
  try { return await request<T>(path,{ method: 'POST', headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: token! }, body: JSON.stringify(body) }); }
  catch (e) {
   if (e instanceof HelmApiError && e.status === 403 && e.code === 'csrf_invalid') {
    token = null;
    // Refresh credentials for a future explicit action; never replay this mutation.
    try { await getSession(); } catch { /* Preserve the original mutation failure. */ }
   }
   throw e;
  }
 }
 return { getSession, apiGet, apiPost };
}
export const { getSession, apiGet, apiPost } = createApiClient();
