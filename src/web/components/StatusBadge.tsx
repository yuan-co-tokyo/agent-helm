import type { DisplayState, PrInfo } from '../../shared/api.js';
import { DISPLAY_STATE_LABELS, isSafeHttpUrl, PR_STATE_LABELS } from '../state/labels.js';
export function StatusBadge({ state }: { state: DisplayState }) {
 const { label, tone, symbol } = DISPLAY_STATE_LABELS[state];
 return <span className={`badge badge--${tone}`} data-state={state}>{symbol} {label}</span>;
}
export function PrBadge({ pr }: { pr: PrInfo }) {
 return <span className="pr-badge">{PR_STATE_LABELS[pr.state]}{pr.url && <> · {isSafeHttpUrl(pr.url) ? <a href={pr.url} target="_blank" rel="noopener noreferrer">{pr.number === null ? 'PRを開く' : `#${pr.number}`}</a> : <span>{pr.url}</span>}</>}</span>;
}
