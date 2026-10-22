import type { AttentionItem } from '../../shared/api.js';
export interface AttentionPanelProps { items: AttentionItem[] }
export function AttentionPanel(props: AttentionPanelProps) {
 void props;
 return <section aria-label="要対応"><h2>要対応</h2><p>未実装</p></section>;
}
