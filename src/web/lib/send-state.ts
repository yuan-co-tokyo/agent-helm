import type { PaneSnapshot, SendResult } from '../../shared/api.js';
import { inputBlockReason } from '../state/labels.js';
import { HelmApiError } from '../api/client.js';
export type SendState = {kind:'idle'|'sending'|'stale'|'gone'} | {kind:'unknown'; reason?:string} | {kind:'sent'|'sent_unconfirmed'; after?: PaneSnapshot} | {kind:'rejected'; reason:string};
const reasons: Record<string,string> = { payload_too_large:'文字数上限を超えています', csrf_invalid:'セッションが更新されました。もう一度操作してください', not_implemented:'未実装です', bad_request:'入力内容を確認してください', forbidden_origin:'送信元が許可されていません' };
export function classifySendError(error: unknown): SendState {
 if (!(error instanceof HelmApiError)) return {kind:'unknown'};
 if (error.code === 'not_implemented' && error.status === 501) return {kind:'rejected',reason:reasons.not_implemented!};
 if (error.status === 0 || error.status >= 500 || ['bad_response','agtx_timeout','agtx_bad_response'].includes(error.code)) return {kind:'unknown'};
 if (error.status === 409 && error.code === 'stale') return {kind:'stale'};
 if (error.status === 410) return {kind:'gone'};
 return {kind:'rejected',reason:reasons[error.code] ?? '送信できませんでした。入力と接続を確認してください'};
}
export function fromResult(result: SendResult): SendState {
 if (result.outcome === 'sent' || result.outcome === 'sent_unconfirmed') return {kind:result.outcome,after:result.after};
 if (result.outcome === 'rejected') return {kind:'rejected',reason:result.reason ? inputBlockReason(result.reason) : '送信が拒否されました'};
 return {kind:'unknown',reason:result.reason};
}
export const countChars = (text:string) => text.length;
export const formatTime = (iso:string) => new Date(iso).toLocaleTimeString('ja-JP', {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
export function sendMessage(state:SendState, approval = false):string {
 switch(state.kind) {
 case 'idle': return '';
 case 'sending': return '送信中…';
 case 'sent': return approval ? 'キーを送信しました（結果は下の画面で確認してください）' : 'ペインに入力しました（受理・完了は画面で確認）';
 case 'sent_unconfirmed': return 'キーは届きましたが画面が変わっていません。端末で確認してください';
 case 'rejected': return `送信されませんでした: ${state.reason}`;
 case 'unknown': if (['selection_unverified','prompt_changed'].includes(state.reason ?? '')) return '選択は送信しましたが確定（Enter）は送っていません。画面を確認してください'; return '結果不明: 再送せず画面を確認してください';
 case 'stale': return '画面が変化しました。再確認してください';
 case 'gone': return '対象は終了しています';
 }
}
