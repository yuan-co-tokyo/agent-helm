import type { TaskView } from '../../shared/api.js';
import { TASK_STATUS_LABELS } from '../state/labels.js';
import { PrBadge, StatusBadge } from './StatusBadge.js';
export interface TaskListProps { tasks: TaskView[] | null; stale: boolean; selectedId?: string | null; onSelect?: (id: string) => void }
export function TaskList({ tasks, stale, selectedId, onSelect }: TaskListProps) {
 return <section aria-label="タスク一覧" className={stale ? 'is-stale' : ''} aria-busy={stale}><h2>タスク一覧</h2>
 {stale && <p>前回値（古い）・最新状態を取得できていません</p>}
 {tasks === null ? <p>{stale ? 'タスク一覧を取得できません' : '取得中…'}</p> : tasks.length === 0 ? !stale && <p>タスクなし</p> : <table className="task-table"><thead><tr>{['タスク','フェーズ','担当','状態','依存','PR'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{tasks.map(task => <tr key={task.id} className={task.id === selectedId ? 'is-selected' : ''}>
 <td data-label="タスク"><button onClick={() => onSelect?.(task.id)} aria-pressed={task.id === selectedId}>{task.title}</button></td>
 <td data-label="フェーズ">{TASK_STATUS_LABELS[task.status]} · cycle {task.cycle}</td><td data-label="担当">{task.agent ?? '未割当'}</td><td data-label="状態"><StatusBadge state={task.displayState} /></td>
 <td data-label="依存">{task.depsSatisfied === null ? '不明' : task.depsSatisfied ? '充足' : `未充足: ${task.blockingTasks.length}件`} {task.depsSatisfied === false && task.blockingTasks.map(id => <code key={id} title={id}>{id.slice(0,8)} </code>)}</td><td data-label="PR"><PrBadge pr={task.pr} /></td></tr>)}</tbody></table>}
 </section>;
}
