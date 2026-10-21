import type { TaskView } from '../../shared/api.js';
export interface TaskListProps { tasks: TaskView[]; onSelect?: (id: string) => void }
export function TaskList(props: TaskListProps) {
 void props;
 return <section aria-label="タスク一覧"><h2>タスク一覧</h2><p>未実装</p></section>;
}
