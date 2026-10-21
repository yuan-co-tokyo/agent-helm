import { it } from 'vitest';
import { MockOrchestratorAdapter } from '../../../src/server/orchestrator/mock-adapter.js';
import { adapterContract } from './adapter.contract.js';
it('mock satisfies the adapter contract',async () => {
 const adapter = new MockOrchestratorAdapter(); adapter.status.state = 'running'; adapter.inputReady = { ok: true };
 await adapterContract(adapter,async () => { adapter.inputReady = { ok: false }; });
});
