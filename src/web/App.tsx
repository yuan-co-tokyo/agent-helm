import { useEffect, useState } from 'react';
import type { SessionResponse } from '../shared/api.js';
import { getSession } from './api/client.js';
import { Header } from './components/Header.js';
import { AttentionPanel } from './components/AttentionPanel.js';
import { OrchestratorConsole } from './components/OrchestratorConsole.js';
import { TaskList } from './components/TaskList.js';
import { TaskDetail } from './components/TaskDetail.js';
import { ApprovalPanel } from './components/ApprovalPanel.js';
export function App() {
 const [session,setSession] = useState<SessionResponse | null>(null);
 const [error,setError] = useState<string | null>(null);
 useEffect(() => {
  let active = true;
  getSession().then(value => { if (active) setSession(value); }).catch(() => { if (active) setError('サーバーに接続できません'); });
  return () => { active = false; };
 },[]);
 return <><Header session={session} error={error} /><main><AttentionPanel items={[]} /><div className="columns"><OrchestratorConsole screen={null} /><TaskList tasks={[]} /></div><TaskDetail task={null} /><ApprovalPanel prompt={null} target={null} /></main></>;
}
