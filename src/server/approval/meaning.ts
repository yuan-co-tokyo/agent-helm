import type { ApprovalMeaning } from '../../shared/api.js';
export function classifyMeaning(label: string): ApprovalMeaning {
 if (/don't ask again|do not ask again|\balways\b|for this session|allow all|\bremember\b/i.test(label)) return 'approve_always';
 if (/^(no|deny|reject|quit|exit|cancel|abort)\b/i.test(label)) return 'deny';
 if (/^(yes|allow|approve|proceed|trust|continue)\b/i.test(label)) return 'approve';
 return 'unknown';
}
