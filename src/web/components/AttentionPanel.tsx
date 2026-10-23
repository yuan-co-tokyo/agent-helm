import type { ApprovalTarget, AttentionItem } from '../../shared/api.js';
import { ATTENTION_KIND_LABELS, formatTime } from '../state/labels.js';
export interface AttentionPanelProps { items: AttentionItem[] | null; stale: boolean; onSelect?: (target: ApprovalTarget) => void }
export function AttentionPanel({ items, stale, onSelect }: AttentionPanelProps) {
 return <section aria-label="要対応" className={stale ? 'is-stale' : ''}><div className="section-heading"><div><span className="eyebrow">INBOX</span><h2>要対応</h2></div><span className="count">{items?.length ?? '—'}</span></div>
 {stale && <p>最新状態を取得できていません</p>}
 {items === null ? <p>{stale ? '取得できません' : '取得中…'}</p> : items.length === 0 ? !stale && <p>要対応なし</p> : <>{[true, false].map(approval => {
 const group = items.filter(item => (item.kind === 'approval') === approval);
 return group.length > 0 && <div className="attention-group" role="group" aria-label={approval ? '承認待ち' : 'その他'} key={String(approval)}><h3>{approval ? '承認待ち' : 'その他'}</h3><ul className="attention-list">{group.map(item => <li className={`attention ${approval ? 'attention-approval' : ''}`} key={item.id}><span className="badge badge--warning">{approval ? '◆' : '▲'} {ATTENTION_KIND_LABELS[item.kind]}</span><button className="attention-title" onClick={() => onSelect?.(item.target)}>{item.title}</button><p>{item.reason}</p><small>発生: {item.since ? formatTime(item.since) : '不明'}</small><span className="open-arrow" aria-hidden="true">↗</span></li>)}</ul></div>;
 })}</>}
 </section>;
}
