import type { AttentionItem, DisplayState, PrDisplayState, TaskStatus } from '../../shared/api.js';
export const DISPLAY_STATE_LABELS: Record<DisplayState, { label: string; tone: string; symbol: string }> = {
 disconnected: { label: '切断中', tone: 'muted', symbol: '▲' }, stale: { label: '状態不明（古い）', tone: 'muted', symbol: '▲' },
 approval: { label: '承認待ち', tone: 'warning', symbol: '◆' }, blocked: { label: 'ブロック中', tone: 'warning', symbol: '■' },
 error: { label: 'エラー', tone: 'danger', symbol: '▲' }, reviewing: { label: 'レビュー中', tone: 'info', symbol: '●' },
 phase_done: { label: 'フェーズ完了', tone: 'success', symbol: '✓' }, running: { label: '実行中', tone: 'info', symbol: '●' },
 idle: { label: '待機中', tone: 'muted', symbol: '○' }, unknown: { label: '不明', tone: 'muted', symbol: '?' },
};
export const PR_STATE_LABELS: Record<PrDisplayState, string> = { none: 'PRなし', open_review_pending: 'PR作成済み・レビュー待ち', approved_waiting_merge: '手動マージ待ち', merged: 'マージ済', closed: 'クローズ', unknown: '不明' };
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { backlog: 'バックログ', planning: '計画', running: '実行', review: 'レビュー', done: '完了' };
export const ATTENTION_KIND_LABELS: Record<AttentionItem['kind'], string> = { approval: '承認待ち', blocked: 'ブロック中', error: 'エラー', disconnected: '切断中', stale: '状態不明（古い）' };
export function formatTime(iso: string | Date): string {
 const date = new Date(iso);
 return Number.isNaN(date.getTime()) ? '--:--:--' : [date.getHours(),date.getMinutes(),date.getSeconds()].map(n => String(n).padStart(2,'0')).join(':');
}
export function isSafeHttpUrl(url: string): boolean {
 try { return ['https:','http:'].includes(new URL(url).protocol); } catch { return false; }
}
