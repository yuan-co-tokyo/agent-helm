import { TASK_STATUSES, type TaskView } from '../../shared/api.js';
import { TASK_STATUS_LABELS, formatAge } from '../state/labels.js';
import { PrBadge, StatusBadge } from './StatusBadge.js';
export interface TaskListProps { tasks: TaskView[] | null; stale: boolean; selectedId?: string | null; onSelect?: (id: string) => void }
export function TaskList({ tasks, stale, selectedId, onSelect }: TaskListProps) {
 return <section aria-label="タスク一覧" className={`task-board ${stale ? 'is-stale' : ''}`} aria-busy={stale}>
 <div className="section-heading"><div><span className="eyebrow">WORKSPACE</span><h2>タスクボード</h2></div><span className="count">{tasks?.length ?? '—'}</span></div>
 {stale && <p className="stale-notice">前回値（古い）・最新状態を取得できていません</p>}
 {tasks === null ? <p>{stale ? 'タスク一覧を取得できません' : '取得中…'}</p> : <>
 {tasks.length === 0 && !stale && <p className="empty-state">タスクなし</p>}
 <div className="kanban">{TASK_STATUSES.map(status => {
 const members = tasks.filter(task => task.status === status);
 return <section className="kanban-column" aria-label={TASK_STATUS_LABELS[status]} key={status}>
 <div className="column-heading"><h3>{TASK_STATUS_LABELS[status]}</h3><span className="count" aria-label={`${members.length}件`}>{members.length}</span></div>
 <ul className="task-cards">{members.map(task => <li key={task.id} className={`task-card ${task.id === selectedId ? 'is-selected' : ''}`} data-state={task.displayState}>
 <StatusBadge state={task.displayState} />
 <button className="task-title" onClick={() => onSelect?.(task.id)} aria-pressed={task.id === selectedId}>{task.title}</button>
 <div className="task-meta"><span className="agent-chip">{task.agent ?? '未割当'}</span><span>cycle {task.cycle}</span></div>
 <p className="dependency">{task.depsSatisfied === null ? '不明' : task.depsSatisfied ? '充足' : `未充足: ${task.blockingTasks.length}件`}</p>
 {task.depsSatisfied === false && task.blockingTasks.map(id => <code key={id} title={id}>{id.slice(0,8)} </code>)}
 <div className="card-footer"><PrBadge pr={task.pr} />{task.phaseAgeSecs !== null && <small>経過 {formatAge(task.phaseAgeSecs)}</small>}</div>
 </li>)}</ul>{!members.length && <p className="column-empty">なし</p>}
 </section>;
 })}</div></>}
 </section>;
}
