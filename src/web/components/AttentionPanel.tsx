import type { ApprovalTarget, AttentionItem } from '../../shared/api.js';
import { ATTENTION_KIND_LABELS, formatTime } from '../state/labels.js';
export interface AttentionPanelProps { items: AttentionItem[] | null; stale: boolean; onSelect?: (target: ApprovalTarget) => void }
export function AttentionPanel({ items, stale, onSelect }: AttentionPanelProps) {
 return <section aria-label="要対応" className={stale ? 'is-stale' : ''}><h2>要対応</h2>
 {stale && <p>最新状態を取得できていません</p>}
 {items === null ? <p>{stale ? '取得できません' : '取得中…'}</p> : items.length === 0 ? !stale && <p>要対応なし</p> : <ul className="attention-list">{items.map(item => <li className="attention" key={item.id}><span className="badge badge--warning">▲ {ATTENTION_KIND_LABELS[item.kind]}</span> <button onClick={() => onSelect?.(item.target)}>{item.title}</button><p>{item.reason}</p><small>発生: {item.since ? formatTime(item.since) : '不明'}</small></li>)}</ul>}
 </section>;
}
