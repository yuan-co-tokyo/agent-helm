import { useCallback, useRef, useState } from 'react';
import type { OrchestratorScreenResponse, OrchestratorStatus, SendResult, SessionResponse } from '../../shared/api.js';
import { DEFAULT_INSTRUCTION_MAX_CHARS } from '../../shared/constants.js';
import { projectPath } from '../api/paths.js';
import { apiGet, apiPost } from '../api/client.js';
import { usePaneScreenPolling } from '../hooks/usePaneScreenPolling.js';
import { useStickToBottom } from '../hooks/useStickToBottom.js';
import { classifySendError, countChars, formatTime, fromResult, sendMessage, type SendState } from '../lib/send-state.js';
import { inputBlockReason } from '../state/labels.js';
import { ApprovalPanel } from './ApprovalPanel.js';
import './console-approval.css';
export interface OrchestratorConsoleProps { project:{id:string;name:string}; session:SessionResponse|null; status?:OrchestratorStatus|null; maxChars?:number }
export function OrchestratorConsole({project,session,status,maxChars=DEFAULT_INSTRUCTION_MAX_CHARS}:OrchestratorConsoleProps) {
 const fetcher = useCallback(()=>apiGet<OrchestratorScreenResponse>(projectPath(project.id,'orchestrator','screen')),[project.id]);
 const screen = usePaneScreenPolling(fetcher);
 const {ref:screenRef,onScroll,pinned,jump} = useStickToBottom(screen.data?.text ?? '');
 const [text,setText] = useState('');
 const [state,setState] = useState<SendState>({kind:'idle'});
 const inFlight = useRef(false);
 const target = status?.target;
 const ready = !!session && !!screen.data?.inputReady.ok && !screen.stale && !!text.trim() && countChars(text)<=maxChars && state.kind !== 'sending';
 async function send() {
  if (!ready || inFlight.current) return;
  if (!globalThis.crypto?.randomUUID) { setState({kind:'rejected',reason:'安全な requestId を生成できません'}); return; }
  inFlight.current = true; setState({kind:'sending'});
  try {
   const result = fromResult(await apiPost<SendResult>(projectPath(project.id,'orchestrator','instructions'),{projectId:project.id,text,requestId:crypto.randomUUID()}));
   setState(result);
   if (result.kind === 'sent' || result.kind === 'sent_unconfirmed') { setText(''); screen.refresh(); }
  } catch(error) { setState(classifySendError(error)); }
  finally { inFlight.current = false; }
 }
 return <section className="helm-console" aria-label="Orchestrator コンソール"><span className="eyebrow">COMMUNICATION</span><h2>Orchestrator コンソール</h2>
  <p className="console-meta">プロジェクト: {project.name} / 送信先: {target ? `${target.socket} / ${target.session}:${target.window}` : '未取得'} / ペイン: {status?.paneId ?? '未取得'}</p>
  <p>状態: {status?.state ?? '未取得'} {status?.reason && inputBlockReason(status.reason)}</p>
  <p>{screen.stale ? '切断中・古い画面・最終取得 ' : '最終取得 '}{screen.lastSuccessAt ? formatTime(screen.lastSuccessAt) : '未取得'}</p>
  <div className="terminal-panel"><div className="terminal-heading" aria-hidden="true">● ● ● <span>ORCHESTRATOR</span></div><pre ref={screenRef} onScroll={onScroll}>{screen.data?.text ?? '画面を取得中…'}</pre>
  {!pinned && <button className="jump-latest" onClick={jump}>最新へ ↓</button>}</div>
  {/* Keep the panel mounted so parent polling cannot discard a confirmation or unknown outcome. */}
  <ApprovalPanel screen={screen} target={{kind:'orchestrator'}} project={project} />
  <div className="send-reasons">
  {!screen.data?.inputReady.ok && <p>送信できない理由: {screen.data?.inputReady.reason ? inputBlockReason(screen.data.inputReady.reason) : '画面を取得するまで送信できません'}</p>}
  {!text.trim() && <p>指示を入力してください</p>}
  {screen.stale && <p>古い画面のため送信できません。最新の画面を取得してください</p>}
  {!session && <p>セッションを取得するまで送信できません</p>}
  </div>
  <div className="console-input"><label>指示<textarea value={text} disabled={state.kind==='sending'} onChange={event=>setText(event.target.value)} onKeyDown={event=> { if ((event.ctrlKey || event.metaKey) && event.key==='Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /></label>
  <p className={countChars(text)>maxChars ? 'helm-warning' : ''}>{countChars(text)} / {maxChars}{countChars(text)>maxChars && ' 上限を超えています（切り詰めません）'}</p>
  <small className="keyboard-hint">⌘ / Ctrl + Enter</small><button className="btn-primary" disabled={!ready} onClick={()=>void send()}>指示を送信</button><p role="status" aria-live="polite">{sendMessage(state)}</p></div>
 </section>;
}
