import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiErrorCode, ApiErrorBody } from '../../shared/api.js';
import type { GatewayError } from '../agtx/types.js';
export function apiError(c: Context, status: ContentfulStatusCode, code: ApiErrorCode, message: string) {
 return c.json({ error: { code, message } } satisfies ApiErrorBody,status);
}
export function gatewayErrorToResponse(err: GatewayError): { status: ContentfulStatusCode; body: ApiErrorBody } {
 const mapping: Partial<Record<GatewayError['kind'],[ContentfulStatusCode,ApiErrorCode]>> = {
  unreachable: [502,'agtx_unreachable'], timeout: [504,'agtx_timeout'], not_found: [404,'not_found'],
  conflict: [409,'conflict'], bad_response: [502,'agtx_bad_response'],
  project_not_found: [503,'agtx_project_not_found'], project_ambiguous: [503,'agtx_project_ambiguous']
 };
 const [status,code] = mapping[err.kind] ?? [502,'internal'];
 return { status, body: { error: { code, message: 'agtx: ' + err.kind } } };
}
