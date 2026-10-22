import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../app.js';
import type { AgtxKey, ApiErrorCode, ApprovalRespondRequest, OrchestratorKey, SendResult } from '../../shared/api.js';
import { GatewayError } from '../agtx/types.js';
import { detectApproval, toApprovalPrompt } from '../approval/index.js';
import { RequestStore, TargetLocks, type StoredResponse } from '../approval/store.js';
import { gatewayErrorToResponse } from './errors.js';
const schema = z.object({
 target: z.discriminatedUnion('kind',[z.object({ kind: z.literal('task'), taskId: z.uuid() }),z.object({ kind: z.literal('orchestrator') })]),
 fingerprint: z.string().regex(/^[0-9a-f]{64}$/), key: z.string().min(1).max(16), requestId: z.uuid()
});
const error = (status: StoredResponse['status'], code: ApiErrorCode, message: string): StoredResponse => ({ status, body: { error: { code, message } } });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve,ms));
async function sendWithTimeout(send: () => Promise<Omit<SendResult,'requestId'>>, ms: number): Promise<Omit<SendResult,'requestId'>> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  return await Promise.race([Promise.resolve().then(send),new Promise<Omit<SendResult,'requestId'>>(resolve => {
   timer = setTimeout(() => resolve({ outcome: 'unknown', reason: 'timeout' }),ms);
  })]);
 } catch { return { outcome: 'unknown', reason: 'error' }; }
 finally { clearTimeout(timer); }
}
export function registerApprovalRoutes(app: Hono, deps: AppDeps) {
 const store = new RequestStore();
 const locks = new TargetLocks();
 async function respond(request: ApprovalRespondRequest): Promise<StoredResponse> {
  const { target, requestId } = request;
  let agentHint: string | null = null;
  if (target.kind === 'task') {
   let task;
   try { task = await deps.gateway.getTask(target.taskId); }
   catch (err) { if (err instanceof GatewayError && err.kind === 'not_found') return error(410,'gone','Target no longer available'); throw err; }
   if (!['planning','running','review'].includes(task.status) || !task.sessionName) return error(410,'gone','Target no longer available');
   agentHint = task.agent;
  } else if ((await deps.orchestrator.getStatus()).state !== 'running') return error(410,'gone','Target no longer available');
  const read = () => target.kind === 'task' ? deps.gateway.readPane(target.taskId,200) : deps.orchestrator.readScreen(200);
  const pane = await read();
  const raw = detectApproval(pane.text,{ capturedAt: pane.capturedAt, agentHint });
  if (!raw || raw.fingerprint !== request.fingerprint) return error(409,'stale','Approval prompt changed');
  const prompt = toApprovalPrompt(raw,target.kind);
  const option = prompt.options.find(item => item.key === request.key);
  if (!option) return error(400,'bad_request','Key is not an approval option');
  if (!option.sendable) return { status: 400, body: { error: { code: 'key_not_sendable', message: 'This option cannot be sent from the Web' }, option: { key: option.key, label: option.label } } };
  const sent = await sendWithTimeout(() => target.kind === 'task' ? deps.gateway.sendKey(target.taskId,request.key as AgtxKey) : deps.orchestrator.sendKey(request.key as OrchestratorKey),deps.approval?.sendTimeoutMs ?? 5000);
  const result: SendResult = { requestId, outcome: sent.outcome, ...(sent.reason !== undefined ? { reason: sent.reason } : {}) };
  if (result.outcome !== 'rejected') {
   try { await (deps.approval?.sleep ?? sleep)(deps.approval?.settleMs ?? 1000); result.after = await read(); } catch { /* A failed refresh does not change the send outcome. */ }
  }
  deps.logger.info('approval_send',{ target: target.kind, outcome: result.outcome });
  return { status: 200, body: result };
 }
 app.post('/api/approvals/respond',async c => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) { const result = error(400,'bad_request','Invalid approval request'); return c.json(result.body,result.status); }
  const request = parsed.data;
  let pending = store.get(request.requestId);
  if (!pending) {
   if (!store.hasCapacity()) { const result = error(409,'conflict','request_capacity'); return c.json(result.body,result.status); }
   const targetKey = request.target.kind === 'task' ? 'task:' + request.target.taskId : 'orchestrator';
   if (!locks.acquire(targetKey)) { const result = error(409,'conflict','target_busy'); return c.json(result.body,result.status); }
   pending = Promise.resolve().then(() => respond(request)).catch(err => err instanceof GatewayError ? gatewayErrorToResponse(err) : error(500,'internal','Internal error')).finally(() => locks.release(targetKey));
   store.set(request.requestId,pending);
  }
  const result = await pending;
  return c.json(result.body,result.status);
 });
}
