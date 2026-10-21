import type { ApprovalPrompt, ApprovalTarget } from '../../shared/api.js';
export interface ApprovalPanelProps { prompt: ApprovalPrompt | null; target: ApprovalTarget | null }
export function ApprovalPanel(props: ApprovalPanelProps) {
 void props;
 return <section aria-label="承認"><h2>承認</h2><p>未実装</p></section>;
}
