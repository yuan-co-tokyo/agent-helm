import type { SessionResponse } from '../../shared/api.js';
export interface HeaderProps { session: SessionResponse | null; error?: string | null }
export function Header({ session, error }: HeaderProps) {
 return <header><h1>Agent Helm</h1><p>{session?.target.project.name ?? '接続確認中'} · agtx {session?.versions.agtx ?? '未接続'}</p>{error && <p role="alert">{error}</p>}</header>;
}
