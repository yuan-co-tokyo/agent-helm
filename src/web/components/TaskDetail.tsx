import type { TaskDetailView } from '../../shared/api.js';
export interface TaskDetailProps { task: TaskDetailView | null }
export function TaskDetail(props: TaskDetailProps) {
 void props;
 return <section aria-label="タスク詳細"><h2>タスク詳細</h2><p>未実装</p></section>;
}
