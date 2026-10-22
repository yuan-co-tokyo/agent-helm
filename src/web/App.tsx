import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionResponse, TaskDetailView, TaskView } from '../shared/api.js';
import { apiGet, getSession, HelmApiError } from './api/client.js';
import { createMockApi } from './api/mock.js';
import { useAppState, type ReadApi } from './hooks/usePolling.js';
import { Header } from './components/Header.js';
import { AttentionPanel } from './components/AttentionPanel.js';
import { OrchestratorConsole } from './components/OrchestratorConsole.js';
import { TaskList } from './components/TaskList.js';
import { ApprovalPanel } from './components/ApprovalPanel.js';
import { TaskDetail } from './components/TaskDetail.js';
import { usePaneScreenPolling } from './hooks/usePaneScreenPolling.js';
import { isUuid } from '../shared/constants.js';
const defaultApi = { apiGet, getSession };
export function App({ api = defaultApi }: { api?: typeof defaultApi }) {
 const [session,setSession] = useState<SessionResponse | null>(null);
 const [error,setError] = useState<string | null>(null);
 const [mock,setMock] = useState(import.meta.env.DEV && new URLSearchParams(location.search).has('mock'));
 const [selectedTaskId,setSelectedTaskId] = useState<string | null>(null);
 const [tab,setTab] = useState('attention');
 const consoleRef = useRef<HTMLDivElement>(null);
 const readApi = useMemo(() => {
  const mockApi = createMockApi();
  return { async apiGet<T>(path: string): Promise<T> {
   if (mock) return mockApi.apiGet<T>(path);
   try { return await api.apiGet<T>(path); }
   catch (error) {
    if (import.meta.env.DEV && error instanceof HelmApiError && error.status === 501 && error.code === 'not_implemented') {
     setMock(true); return mockApi.apiGet<T>(path);
    }
    throw error;
   }
  } };
 },[api,mock]);
 const state = useAppState(readApi);
 useEffect(() => {
  let active = true;
  api.getSession().then(value => { if (active) setSession(value); }).catch(() => { if (active) setError('サーバーに接続できません'); });
  return () => { active = false; };
 },[api]);
 return <><Header session={session} sessionError={error} state={state.data} connected={state.connected && state.data?.agtx.reachable !== false} lastSuccessAt={state.lastSuccessAt} mock={mock} /><main data-tab={tab}>
 <div className="attention-section"><AttentionPanel items={state.data?.attention ?? null} stale={!!state.error} onSelect={target => { if (target.kind === 'task') setSelectedTaskId(target.taskId); else { setTab('console'); consoleRef.current?.focus(); } }} /></div>
 <div className="columns"><div className="console-section" ref={consoleRef} tabIndex={-1}><OrchestratorConsole session={session} status={state.data?.orchestrator} /></div><div className="tasks-section"><TaskList tasks={state.data?.tasks ?? null} stale={!!state.error} selectedId={selectedTaskId} onSelect={setSelectedTaskId} /></div></div>
 {selectedTaskId && <SelectedTask key={selectedTaskId} taskId={selectedTaskId} readApi={readApi} projectName={session?.target.project.name} summary={state.data?.tasks.find(task => task.id === selectedTaskId)} onClose={() => setSelectedTaskId(null)} />}
 <nav className="bottom-tabs" aria-label="表示切替">{[['attention','要対応'],['console','コンソール'],['tasks','タスク']].map(([key,label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key!)}>{label}</button>)}</nav>
 </main></>;
}

function SelectedTask({taskId,readApi,projectName,summary,onClose}:{taskId:string;readApi:ReadApi;projectName?:string;summary?:TaskView;onClose:()=>void}) {
 const screen = usePaneScreenPolling(useCallback(()=>readApi.apiGet<TaskDetailView>(`/api/tasks/${taskId}`),[readApi,taskId]),1500,isUuid(taskId));
 const error = screen.error == null ? null : screen.error instanceof Error ? screen.error : new Error(String(screen.error));
 return <TaskDetail taskId={taskId} detail={screen.data} summary={summary} connected={!!screen.lastSuccessAt && !screen.stale} lastSuccessAt={screen.lastSuccessAt} error={error} onClose={onClose} renderApproval={target => <ApprovalPanel target={target} screen={screen} projectName={projectName} />} />;
}
