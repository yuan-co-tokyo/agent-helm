import type { OrchestratorStatus } from '../../shared/api.js';
import { TmuxError, type TmuxRunner } from './exec.js';
export type ResolvedPane = Pick<OrchestratorStatus,'state'|'paneId'|'currentCommand'|'reason'>;
export async function resolvePane(runner: TmuxRunner, session: string, window: string): Promise<ResolvedPane> {
 const missing = { paneId: null, currentCommand: null };
 if (![session,window].every(v => /^[A-Za-z0-9_-]+$/.test(v))) return { ...missing, state: 'error', reason: 'invalid_target' };
 try {
  const rows = (await runner.run(['list-panes','-t',`=${session}:=${window}`,'-F','#{pane_id}\t#{pane_dead}\t#{pane_current_command}'])).trim().split('\n').filter(Boolean);
  if (!rows.length) return { ...missing, state: 'not_found' };
  if (rows.length > 1) return { ...missing, state: 'ambiguous' };
  const [paneId = '',dead = '',currentCommand = ''] = rows[0]!.split('\t');
  if (!/^%\d+$/.test(paneId) || !['0','1'].includes(dead)) return { ...missing, state: 'error', reason: 'invalid_pane' };
  if (dead === '1') return { ...missing, state: 'not_found', reason: 'pane_dead' };
  return { state: 'running', paneId, currentCommand };
 } catch (e) {
  return { ...missing, state: e instanceof TmuxError && ['no_server','not_found'].includes(e.kind) ? 'not_found' : 'error', reason: e instanceof TmuxError ? e.kind : 'tmux_error' };
 }
}
