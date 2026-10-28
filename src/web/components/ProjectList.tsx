import type { ProjectsResponse } from '../../shared/api.js';
import { usePolling, type ReadApi } from '../hooks/usePolling.js';
import { formatTime } from '../state/labels.js';
export function ProjectList({ api }: { api: ReadApi }) {
 const result = usePolling(() => api.apiGet<ProjectsResponse>('/api/projects'),{ intervalMs: 10000 });
 return <main className="projects-page"><h2>プロジェクト一覧</h2>
 {result.error && <p role="alert">取得できませんでした。{result.data && '古い情報を表示しています。'}</p>}
 {!result.data && !result.error && <p>取得中…</p>}
 <div className="project-list">{result.data?.projects.map(project => <a className="project-card" key={project.id} href={`#/p/${project.id}`}>
 <h3>{project.name}</h3><p>{project.pathTail ?? 'パス不明'}</p>
 <p className="project-card-meta">{project.tuiConnected === null ? 'TUI 接続不明' : project.tuiConnected ? 'TUI 接続' : 'TUI未接続'}</p>
 <p>Orchestrator: {project.orchestrator?.state ?? '不明'} {project.orchestrator?.reason}</p>
 <p>要対応: {project.attentionCount ?? '不明'} / <span className="badge--warning approval-count">承認: {project.approvalCount ?? '不明'}</span></p>
 <p>最終取得: {project.fetchedAt ? formatTime(new Date(project.fetchedAt)) : '未取得'}</p>
 {project.error && <p>取得エラー・古い情報または未取得</p>}
 </a>)}</div>{result.data?.projects.length === 0 && <p>プロジェクトがありません</p>}</main>;
}
