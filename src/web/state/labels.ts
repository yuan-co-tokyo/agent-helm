import type { AttentionItem, DisplayState, PrDisplayState, TaskStatus } from '../../shared/api.js';
export const DISPLAY_STATE_LABELS: Record<DisplayState, { label: string; tone: string; symbol: string }> = {
 awaiting_input: { label: '入力待ち（完了確認待ち）', tone: 'info', symbol: '○' },
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

export const INPUT_BLOCK_REASONS: Record<string,string> = {
 input_not_empty: '入力欄に文字が残っています（プレースホルダー表示の場合もあります）。端末で入力欄を空にしてください',
 approval_pending: '承認待ちです。下の承認パネルか端末で先に対応してください',
 menu_open: 'メニュー・選択肢が開いています。端末で閉じてください',
 prompt_not_found: '入力プロンプトが見つかりません（作業中、または画面を認識できません）',
 completion_open: '補完候補が表示されています。端末で閉じてください',
 too_long: '文字数上限を超えています', control_char: '送信できない制御文字が含まれています', invalid_type: '指示を文字列で入力してください',
 target_changed: '送信先が変わりました。最新の画面を確認してください', invalid_target: '送信先の設定が不正です',
 invalid_pane: '対象のペイン情報が不正です', pane_dead: '対象のペインは終了しています', no_server: '端末サーバーが起動していません',
 not_ready: '入力を受け付ける状態ではありません', busy: '送信処理中です。しばらくお待ちください',
 not_found: '対象のペインが見つかりません', ambiguous: '対象のペインを一つに特定できません',
 tmux_error: '端末の状態を取得できません', status_unavailable: '状態を取得できません',
 not_implemented: '未実装です', not_delivered: 'キーを端末に渡せませんでした',
 key_not_allowed: 'このキーは送信できません', empty: '指示を入力してください',
 payload_too_large: '文字数上限を超えています', conflict: '対象が入力を受け付けません',
};
export function inputBlockReason(code: string): string {
 return INPUT_BLOCK_REASONS[code] ?? `送信できない状態です（コード: ${code}）`;
}
