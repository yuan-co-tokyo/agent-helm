import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApprovalMeaning, ApprovalOption, ApprovalPrompt, ApprovalTarget, OrchestratorScreenResponse, PaneSnapshot, SendResult, TaskDetailView } from '../../shared/api.js';
import { isUuid } from '../../shared/constants.js';
import { apiGet, apiPost, HelmApiError } from '../api/client.js';
import { usePaneScreenPolling } from '../hooks/usePaneScreenPolling.js';
import { classifySendError, formatTime, fromResult, sendMessage, type SendState } from '../lib/send-state.js';
import './console-approval.css';
export interface ApprovalPanelProps { target:ApprovalTarget|null; projectName?:string }
interface TargetView { title:string; agent:string|null; approval:ApprovalPrompt|null; pane:PaneSnapshot|null }
interface Selection { view:TargetView; prompt:ApprovalPrompt; option:ApprovalOption }
const meanings: ApprovalMeaning[] = ['deny','unknown','approve','approve_always'];
const badges = {deny:'拒否',unknown:'',approve:'承認',approve_always:'⚠ 以後確認しない'};
const excerpt = (pane:PaneSnapshot|null)=>pane?.text.split('\n').slice(-20).join('\n') ?? '画面なし';
export function ApprovalPanel({target,projectName}:ApprovalPanelProps) {
 if (!target) return null;
 return <TargetPanel key={target.kind==='task' ? target.taskId : 'orchestrator'} target={target} projectName={projectName} />;
}
function TargetPanel({target,projectName}:{target:ApprovalTarget;projectName?:string}) {
 const kind = target.kind, taskId = target.kind==='task' ? target.taskId : '';
 const [selection,setSelection] = useState<Selection|null>(null);
 const [state,setState] = useState<SendState>({kind:'idle'});
 const [checking,setChecking] = useState(false);
 const [blockedRevision,setBlockedRevision] = useState<number|null>(null);
 const inFlight = useRef(false);
 const load = useCallback(async ():Promise<TargetView>=> {
  if (kind==='task') {
   if (!isUuid(taskId)) throw new HelmApiError(400,'bad_request');
   return apiGet<TaskDetailView>(`/api/tasks/${encodeURIComponent(taskId)}`);
  }
  const screen = await apiGet<OrchestratorScreenResponse>('/api/orchestrator/screen');
  return {title:'Orchestrator',agent:screen.approval?.agentKind ?? null,approval:screen.approval,pane:screen};
 },[kind,taskId]);
 const polling = usePaneScreenPolling(load,1500,!selection && state.kind!=='unknown' && state.kind!=='gone' && !checking);
 const [verified,setVerified] = useState<{data:TargetView;baseline:number}|null>(null);
 // A manual verification replaces the frozen unknown result; subsequent polls take over.
 const view = selection?.view ?? (verified && verified.baseline===polling.revision ? verified.data : polling.data);
 const gone = state.kind==='gone' || (polling.error instanceof HelmApiError && [404,410].includes(polling.error.status));
 async function checkLatest() {
  if (inFlight.current || checking) return;
  setChecking(true);
  try { const data = await load(); setVerified({data,baseline:polling.revision}); setState({kind:'idle'}); setBlockedRevision(null); }
  catch(error) { setState(error instanceof HelmApiError && [404,410].includes(error.status) ? {kind:'gone'} : state.kind==='unknown' ? {kind:'unknown'} : classifySendError(error)); }
  finally { setChecking(false); }
 }
 async function send() {
  if (!selection || inFlight.current) return;
  if (!globalThis.crypto?.randomUUID) { setState({kind:'rejected',reason:'安全な requestId を生成できません'}); setSelection(null); return; }
  inFlight.current = true; setState({kind:'sending'});
  let result:SendState;
  try { result = fromResult(await apiPost<SendResult>('/api/approvals/respond',{target,fingerprint:selection.prompt.fingerprint,key:selection.option.key,requestId:crypto.randomUUID()})); }
  catch(error) { result = classifySendError(error); }
  if (result.kind==='stale' || result.kind==='sent') setBlockedRevision(polling.revision);
  setVerified(null); setState(result); setSelection(null); inFlight.current = false;
 }
 const disabled = (blockedRevision!==null && polling.revision<=blockedRevision) || !!selection || checking || polling.stale || state.kind==='unknown' || state.kind==='sending';
 return <section className="helm-approval" aria-label="承認"><h2>承認</h2>
  <p>対象: {projectName} / {view?.title ?? (kind==='task' ? taskId : 'Orchestrator')} / {view?.agent}</p>
  {polling.stale && <p>切断中・古い画面・最終取得 {polling.lastSuccessAt ? formatTime(polling.lastSuccessAt) : '未取得'}</p>}
  <p role="status" aria-live="polite">{gone ? '対象は終了しています' : sendMessage(state,true)}</p>
  {!gone && <><p>取得時刻: {view?.approval?.capturedAt ?? view?.pane?.capturedAt ?? '未取得'}</p>
   <p>{view ? view.approval?.question ?? '承認待ちは検出されていません' : '取得中…'}</p>
   <pre>{excerpt(view?.pane ?? null)}</pre>
   <div className="approval-options">{meanings.map(meaning=><div className="approval-group" key={meaning}>{view?.approval?.options.filter(option=>option.meaning===meaning).map(option=><button key={option.key} className={meaning==='approve_always' ? 'helm-warning' : ''} disabled={disabled} onClick={()=> { if (view?.approval) { setVerified(null); setSelection({view,prompt:view.approval,option}); } }}>[{option.key}] {option.label}{' '}{badges[meaning] && <span className="approval-badge"> {badges[meaning]}</span>}</button>)}</div>)}</div>
   <button disabled={!!selection || checking} onClick={()=>void checkLatest()}>最新を確認</button></>}
  {state.kind==='sent' && state.after && <><h3>送信後の画面</h3><pre>{state.after.text}</pre></>}
  {selection && <ConfirmDialog selection={selection} projectName={projectName} sending={state.kind==='sending'} onCancel={()=> { if (!inFlight.current) setSelection(null); }} onSend={()=>void send()} />}
 </section>;
}
function ConfirmDialog({selection,projectName,sending,onCancel,onSend}:{selection:Selection;projectName?:string;sending:boolean;onCancel:()=>void;onSend:()=>void}) {
 const cancel = useRef<HTMLButtonElement>(null);
 const send = useRef<HTMLButtonElement>(null);
 useEffect(()=> { const previous = document.activeElement; cancel.current?.focus(); return ()=> { if (previous instanceof HTMLElement) previous.focus(); }; },[]);
 return <div className="approval-overlay"><div role="dialog" aria-modal="true" aria-label="キー送信の確認" className="approval-dialog" onKeyDown={event=> {
  if (event.key==='Escape' && !sending) onCancel();
  if (event.key==='Tab') { event.preventDefault(); if (!sending) (document.activeElement===cancel.current ? send : cancel).current?.focus(); }
 }}>
 <h3>キー送信の確認</h3><p>対象: {projectName} / {selection.view.title} / {selection.view.agent}</p>
 <p>取得時刻: {selection.prompt.capturedAt}</p><p>{selection.prompt.question}</p><pre>{excerpt(selection.view.pane)}</pre>
 <p>押すキー: [{selection.option.key}] {selection.option.label}</p>
 {selection.option.meaning==='approve_always' && <p className="helm-warning">⚠ 以後確認しない: 今後の操作が確認なしで許可される可能性があります。</p>}
 <button ref={cancel} disabled={sending} onClick={onCancel}>キャンセル</button><button ref={send} disabled={sending} onClick={onSend}>送信</button>
 </div></div>;
}
