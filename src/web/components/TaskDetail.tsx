import { useEffect, useRef, type ReactNode } from 'react';
import type { ApprovalPrompt, ApprovalTarget, TaskDetailView, TaskView } from '../../shared/api.js';
import { isUuid, TERMINAL_ONLY_MESSAGE } from '../../shared/constants.js';
import { formatTime } from '../state/labels.js';
import { stripControl } from '../text.js';
import { ApprovalPanel } from './ApprovalPanel.js';
import { PrBadge, StatusBadge } from './StatusBadge.js';
export interface TaskDetailProps { taskId: string | null; detail: TaskDetailView | null; summary?: TaskView | null; connected: boolean; lastSuccessAt: Date | null; error: Error | null; onClose: () => void; renderApproval?: (target: ApprovalTarget, prompt: ApprovalPrompt | null) => ReactNode }
export function TaskDetail({ taskId, detail, summary, connected, lastSuccessAt, error, onClose, renderApproval }: TaskDetailProps) {
 const dialog = useRef<HTMLDialogElement>(null);
 const pane = useRef<HTMLPreElement>(null);
 const follow = useRef(true);
 useEffect(() => {
  if (!taskId) return;
  const previous = document.activeElement;
  const element = dialog.current;
  if (element && typeof element.showModal === 'function') element.showModal();
  else element?.setAttribute('open','');
  follow.current = true;
  return () => { if (element && typeof element.close === 'function') element.close(); else element?.removeAttribute('open'); if (previous instanceof HTMLElement) previous.focus(); };
 },[taskId]);
 useEffect(() => { if (pane.current && follow.current) pane.current.scrollTop = pane.current.scrollHeight; },[detail?.pane?.text]);
 if (!taskId) return null;
 const task = detail ?? summary;
 const target: ApprovalTarget = { kind: 'task', taskId };
 return <dialog ref={dialog} className="task-drawer" aria-modal="true" aria-labelledby="detail-title" onCancel={event => { event.preventDefault(); onClose(); }}>
 <button className="close-detail" onClick={onClose} autoFocus>閉じる</button><h2 id="detail-title">{task?.title ?? 'タスク詳細'}</h2>
 {task && <StatusBadge state={task.displayState} />}
 {!isUuid(taskId) && <p role="alert">不正なタスクIDです</p>}
 {isUuid(taskId) && !connected && <p role="alert">{error ? `切断中・${lastSuccessAt ? `最終取得 ${formatTime(lastSuccessAt)}` : '未取得'} (${error.message})` : '取得中…'}</p>}
 <div className={!connected && detail ? 'is-stale' : ''}>
 {detail && <><h3>説明</h3><p className="pre-line">{detail.description ?? '説明なし'}</p>
 {(detail.blockedReason || detail.displayState === 'blocked') && <p>ブロック理由: {detail.blockedReason ?? '理由不明'}</p>}
 {detail.escalationNote && <p>エスカレーション: {detail.escalationNote}</p>}
 <h3>PR</h3><PrBadge pr={detail.pr} /><p>PR 最終取得: {detail.pr.fetchedAt ? formatTime(detail.pr.fetchedAt) : '未取得'}</p>
 <h3>テスト結果</h3><p>未取得（出典: ペイン）{detail.testResult.source && ` · ${detail.testResult.source}`}</p>
 {detail.approval?.terminalOnly && <p className="helm-warning">{TERMINAL_ONLY_MESSAGE}</p>}
 <h3>ペイン</h3>{detail.paneError && <p role="alert">ペイン取得エラー: {detail.paneError.code} · {detail.paneError.message}</p>}
 {detail.pane ? <><small>取得: {formatTime(detail.pane.capturedAt)}</small><pre ref={pane} className="pane" aria-label="ペイン出力" tabIndex={0} onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}>{stripControl(detail.pane.text)}</pre></> : <p>ペイン未取得</p>}
 </>}
 </div><div className="approval-slot">{isUuid(taskId) && (renderApproval ? renderApproval(target,detail?.approval ?? null) : <ApprovalPanel target={target}  />)}</div>
 </dialog>;
}
