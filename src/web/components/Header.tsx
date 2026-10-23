import type { SessionResponse, StateResponse } from '../../shared/api.js';
import { SUPPORTED_AGTX_VERSION } from '../../shared/constants.js';
import { formatTime } from '../state/labels.js';
export interface HeaderProps { project: {id:string;name:string} | null; session: SessionResponse | null; sessionError?: string | null; state: StateResponse | null; connected: boolean; lastSuccessAt: Date | null; mock?: boolean }
export function Header({ project, session, sessionError, state, connected, lastSuccessAt, mock }: HeaderProps) {
 const version = state?.agtx.version ?? session?.versions.agtx;
 const supported = session?.versions.agtxSupported ?? SUPPORTED_AGTX_VERSION;
 const orchestratorLabels = { running: '実行中', not_found: '見つかりません', ambiguous: '対象を特定できません', error: 'エラー' };
 return <header className="app-header"><div className="brand"><span className="brand-mark" aria-hidden="true">⎈</span><h1>Agent Helm</h1><p>{project?.name ?? 'プロジェクト一覧'}</p></div>
 {mock && <p className="mock-banner" role="status">モックデータ表示中</p>}
 {sessionError && <p role="alert">{sessionError}</p>}
 {project && <a className="back-link" href="#/">← プロジェクト一覧</a>}
 {project && <><div className="health"><span className={`health-pill ${state?.agtx.reachable ? 'healthy' : ''}`}>agtx: {state ? state.agtx.reachable ? '到達' : '到達不可' : '確認中'}</span><span className={`health-pill ${state?.agtx.tuiConnected ? 'healthy' : ''}`}>TUI: {state?.agtx.tuiConnected == null ? '不明' : state.agtx.tuiConnected ? '接続' : '未接続'}</span><span className={`health-pill ${state?.orchestrator.state === 'running' ? 'healthy' : ''}`}>Orchestrator: {state ? orchestratorLabels[state.orchestrator.state] : '確認中'}</span></div>
 {state?.orchestrator.reason && <p>{state.orchestrator.reason}</p>}
 <p role="status">{version ? version !== supported ? `agtx バージョン ${version} は未検証（対応: ${supported}）` : `agtx ${version}` : 'バージョン不明'}</p>
 {!connected ? <p role="alert">切断中・{lastSuccessAt ? `最終取得 ${formatTime(lastSuccessAt)}` : '未取得'}</p> : <p>最終取得 {lastSuccessAt ? formatTime(lastSuccessAt) : '--:--:--'}</p>}
 </>}
 </header>;
}
