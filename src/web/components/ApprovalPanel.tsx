import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ApprovalMeaning, ApprovalOption, ApprovalPrompt, ApprovalTarget, OrchestratorScreenResponse, PaneSnapshot, SendResult, TaskDetailView } from '../../shared/api.js';
import { isUuid, TERMINAL_ONLY_MESSAGE } from '../../shared/constants.js';
import { apiGet, apiPost, HelmApiError } from '../api/client.js';
import { usePaneScreenPolling, type PaneScreenPolling } from '../hooks/usePaneScreenPolling.js';
import { classifySendError, formatTime, fromResult, sendMessage, type SendState } from '../lib/send-state.js';
import './console-approval.css';
export interface ApprovalPanelProps { target:ApprovalTarget|null; projectName?:string; screen?:PaneScreenPolling<OrchestratorScreenResponse> }
interface TargetView { title:string; agent:string|null; approval:ApprovalPrompt|null; pane:PaneSnapshot|null }
interface Selection { view:TargetView; prompt:ApprovalPrompt; option:ApprovalOption }
const meanings: ApprovalMeaning[] = ['deny','unknown','approve','approve_always'];
const badges = {deny:'拒否',unknown:'',approve:'承認',approve_always:'⚠ 以後確認しない'};
const excerpt = (pane:PaneSnapshot|null)=>pane?.text.split('\n').slice(-20).join('\n') ?? '画面なし';
export function ApprovalPanel({target,projectName,screen}:ApprovalPanelProps) {
 if (!target) return null;
 return <TargetPanel key={target.kind==='task' ? target.taskId : 'orchestrator'} target={target} projectName={projectName} screen={screen} />;
}
function TargetPanel({target,projectName,screen}:ApprovalPanelProps & {target:ApprovalTarget}) {
 const kind = target.kind, taskId = target.kind==='task' ? target.taskId : '';
 const [selection,setSelection] = useState<Selection|null>(null);
 const [state,setState] = useState<SendState>({kind:'idle'});
 const [checking,setChecking] = useState(false);
 const [checkFailed,setCheckFailed] = useState(false);
 const [blockedSeq,setBlockedSeq] = useState<number|null>(null);
 const inFlight = useRef(false);
 const load = useCallback(async ():Promise<TargetView>=> {
  if (kind==='task') {
   if (!isUuid(taskId)) throw new HelmApiError(400,'bad_request');
   return apiGet<TaskDetailView>(`/api/tasks/${encodeURIComponent(taskId)}`);
  }
  const screen = await apiGet<OrchestratorScreenResponse>('/api/orchestrator/screen');
  return {title:'Orchestrator',agent:screen.approval?.agentKind ?? null,approval:screen.approval,pane:screen};
 },[kind,taskId]);
 const shared = kind==='orchestrator' && !!screen;
 const own = usePaneScreenPolling(load,1500,!shared && !selection && state.kind!=='unknown' && state.kind!=='gone' && !checking);
 const screenData = screen?.data;
 const mapped = useMemo(()=>screenData ? {title:'Orchestrator',agent:screenData.approval?.agentKind ?? null,approval:screenData.approval,pane:screenData} : null,[screenData]);
 const polling = shared && screen ? {...screen,data:mapped} : own;
 const [held,setHeld] = useState<TargetView|null>(null);
 const [verified,setVerified] = useState<{data:TargetView;baseline:number}|null>(null);
 // A manual verification replaces the frozen unknown result; subsequent polls take over.
 const view = selection?.view ?? held ?? (verified && verified.baseline===polling.revision ? verified.data : polling.data);
 const gone = state.kind==='gone' || (polling.error instanceof HelmApiError && [404,410].includes(polling.error.status));
 async function checkLatest() {
  if (inFlight.current || checking) return;
  setChecking(true); setCheckFailed(false);
  try { const data = await load(); setVerified({data,baseline:polling.revision}); setState({kind:'idle'}); setHeld(null); setBlockedSeq(null); }
  // A failed read sends nothing, so keep the current send state rather than reporting an unknown send.
  catch(error) { if (error instanceof HelmApiError && [404,410].includes(error.status)) setState({kind:'gone'}); else setCheckFailed(true); }
  finally { setChecking(false); }
 }
 async function send() {
  if (!selection || inFlight.current) return;
  if (!globalThis.crypto?.randomUUID) { setState({kind:'rejected',reason:'安全な requestId を生成できません'}); setSelection(null); return; }
  inFlight.current = true; setState({kind:'sending'});
  let result:SendState;
  try { result = fromResult(await apiPost<SendResult>('/api/approvals/respond',{target,fingerprint:selection.prompt.fingerprint,key:selection.option.key,requestId:crypto.randomUUID()})); }
  catch(error) { result = classifySendError(error); }
  if (result.kind==='stale' || result.kind==='sent') { setBlockedSeq(polling.startedSeq()); polling.refresh(); }
  if (result.kind==='unknown' || result.kind==='gone') setHeld(selection.view);
  setVerified(null); setState(result); setSelection(null); inFlight.current = false;
 }
 const disabled = (blockedSeq!==null && polling.seq<=blockedSeq) || !!selection || checking || polling.stale || state.kind==='unknown' || state.kind==='sending';
 return <section className="helm-approval" aria-label="承認"><h2>承認</h2>
  <p>対象: {projectName} / {view?.title ?? (kind==='task' ? taskId : 'Orchestrator')} / {view?.agent}</p>
  {polling.stale && <p>切断中・古い画面・最終取得 {polling.lastSuccessAt ? formatTime(polling.lastSuccessAt) : '未取得'}</p>}
  <p role="status" aria-live="polite">{gone ? '対象は終了しています' : sendMessage(state,true)}</p>
  {!gone && <><p>取得時刻: {view?.approval?.capturedAt || view?.pane?.capturedAt ? formatTime(view.approval?.capturedAt ?? view.pane!.capturedAt) : '未取得'}</p>
   <p>{view ? view.approval?.question ?? '承認待ちは検出されていません' : '取得中…'}</p>
   {view?.approval?.terminalOnly && <><p className="helm-warning">{TERMINAL_ONLY_MESSAGE}</p><p>{view.approval.detail}</p></>}
   <pre>{excerpt(view?.pane ?? null)}</pre>
   <div className="approval-options">{meanings.map(meaning=><div className="approval-group" key={meaning}>{view?.approval?.options.filter(option=>option.meaning===meaning).map(option=><button key={option.key} className={meaning==='approve_always' ? 'helm-warning' : ''} disabled={disabled} onClick={()=> { if (view?.approval) { setVerified(null); setSelection({view,prompt:view.approval,option}); } }}>[{option.key}] {option.label}{' '}{badges[meaning] && <span className="approval-badge"> {badges[meaning]}</span>}</button>)}</div>)}</div>
   <button disabled={!!selection || checking} onClick={()=>void checkLatest()}>最新を確認</button>
   {checkFailed && <p className="helm-warning">最新の画面を取得できませんでした</p>}</>}
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
 <p>取得時刻: {formatTime(selection.prompt.capturedAt)}</p><p>{selection.prompt.question}</p><pre>{excerpt(selection.view.pane)}</pre>
 <p>押すキー: [{selection.option.key}] {selection.option.label}</p>
 {selection.option.meaning==='approve_always' && <p className="helm-warning">⚠ 以後確認しない: 今後の操作が確認なしで許可される可能性があります。</p>}
 <button ref={cancel} disabled={sending} onClick={onCancel}>キャンセル</button><button ref={send} disabled={sending} onClick={onSend}>送信</button>
 </div></div>;
}
