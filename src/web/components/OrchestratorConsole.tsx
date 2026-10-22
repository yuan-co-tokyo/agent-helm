import { useCallback, useRef, useState } from 'react';
import type { OrchestratorScreenResponse, OrchestratorStatus, SendResult, SessionResponse } from '../../shared/api.js';
import { DEFAULT_INSTRUCTION_MAX_CHARS } from '../../shared/constants.js';
import { apiGet, apiPost } from '../api/client.js';
import { usePaneScreenPolling } from '../hooks/usePaneScreenPolling.js';
import { useStickToBottom } from '../hooks/useStickToBottom.js';
import { classifySendError, countChars, formatTime, fromResult, sendMessage, type SendState } from '../lib/send-state.js';
import { inputBlockReason } from '../state/labels.js';
import { ApprovalPanel } from './ApprovalPanel.js';
import './console-approval.css';
export interface OrchestratorConsoleProps { session:SessionResponse|null; status?:OrchestratorStatus|null; maxChars?:number }
export function OrchestratorConsole({session,status,maxChars=DEFAULT_INSTRUCTION_MAX_CHARS}:OrchestratorConsoleProps) {
 const fetcher = useCallback(()=>apiGet<OrchestratorScreenResponse>('/api/orchestrator/screen'),[]);
 const screen = usePaneScreenPolling(fetcher);
 const {ref:screenRef,onScroll,pinned,jump} = useStickToBottom(screen.data?.text ?? '');
 const [text,setText] = useState('');
 const [state,setState] = useState<SendState>({kind:'idle'});
 const inFlight = useRef(false);
 const target = session?.target.orchestrator;
 const ready = !!session && !!screen.data?.inputReady.ok && !screen.stale && !!text.trim() && countChars(text)<=maxChars && state.kind !== 'sending';
 async function send() {
  if (!ready || inFlight.current) return;
  if (!globalThis.crypto?.randomUUID) { setState({kind:'rejected',reason:'安全な requestId を生成できません'}); return; }
  inFlight.current = true; setState({kind:'sending'});
  try {
   const result = fromResult(await apiPost<SendResult>('/api/orchestrator/instructions',{text,requestId:crypto.randomUUID()}));
   setState(result);
   if (result.kind === 'sent' || result.kind === 'sent_unconfirmed') { setText(''); screen.refresh(); }
  } catch(error) { setState(classifySendError(error)); }
  finally { inFlight.current = false; }
 }
 return <section className="helm-console" aria-label="Orchestrator コンソール"><h2>Orchestrator コンソール</h2>
  <p>プロジェクト: {session?.target.project.name ?? '未取得'} / 送信先: {target ? `${target.socket} / ${target.session}:${target.window}` : '未取得'} / ペイン: {status?.paneId ?? '未取得'}</p>
  <p>状態: {status?.state ?? '未取得'} {status?.reason && inputBlockReason(status.reason)}</p>
  <p>{screen.stale ? '切断中・古い画面・最終取得 ' : '最終取得 '}{screen.lastSuccessAt ? formatTime(screen.lastSuccessAt) : '未取得'}</p>
  <pre ref={screenRef} onScroll={onScroll}>{screen.data?.text ?? '画面を取得中…'}</pre>
  {!pinned && <button onClick={jump}>最新へ ↓</button>}
  {/* Keep the panel mounted so parent polling cannot discard a confirmation or unknown outcome. */}
  <ApprovalPanel screen={screen} target={{kind:'orchestrator'}} projectName={session?.target.project.name} />
  <div className="console-input"><label>指示<textarea value={text} disabled={state.kind==='sending'} onChange={event=>setText(event.target.value)} onKeyDown={event=> { if ((event.ctrlKey || event.metaKey) && event.key==='Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} /></label>
  <p className={countChars(text)>maxChars ? 'helm-warning' : ''}>{countChars(text)} / {maxChars}{countChars(text)>maxChars && ' 上限を超えています（切り詰めません）'}</p>
  {!screen.data?.inputReady.ok && <p>送信できない理由: {screen.data?.inputReady.reason ? inputBlockReason(screen.data.inputReady.reason) : '画面を取得するまで送信できません'}</p>}
  {!text.trim() && <p>指示を入力してください</p>}
  {screen.stale && <p>古い画面のため送信できません。最新の画面を取得してください</p>}
  {!session && <p>セッションを取得するまで送信できません</p>}
  <button disabled={!ready} onClick={()=>void send()}>指示を送信</button><p role="status" aria-live="polite">{sendMessage(state)}</p></div>
 </section>;
}
