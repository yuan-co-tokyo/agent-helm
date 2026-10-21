import type { OrchestratorScreenResponse } from '../../shared/api.js';
export interface OrchestratorConsoleProps { screen: OrchestratorScreenResponse | null }
export function OrchestratorConsole(props: OrchestratorConsoleProps) {
 void props;
 return <section aria-label="Orchestrator コンソール"><h2>Orchestrator コンソール</h2><p>未実装</p></section>;
}
