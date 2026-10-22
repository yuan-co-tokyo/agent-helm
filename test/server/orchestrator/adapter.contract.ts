import { expect } from 'vitest';
import type { OrchestratorAdapter, OrchestratorKey } from '../../../src/server/orchestrator/types.js';
export async function adapterContract(adapter: OrchestratorAdapter, block: () => Promise<void>) {
 expect(await adapter.sendKey('C-c' as OrchestratorKey)).toMatchObject({ outcome: 'rejected', reason: 'key_not_allowed' });
 expect(await adapter.sendInstruction('hello')).toMatchObject({ outcome: 'sent' });
 await block();
 expect(await adapter.sendInstruction('blocked')).toMatchObject({ outcome: 'rejected' });
}
