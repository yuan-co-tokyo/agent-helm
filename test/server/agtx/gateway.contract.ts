import { describe, expect, it } from 'vitest';
import type { AgtxGateway } from '../../../src/server/agtx/types.js';
import type { AgtxKey } from '../../../src/shared/api.js';
import { TASK_ID, PROJECT_ID } from '../../mock-agtx/fixtures.js';
export function gatewayContract(name: string, setup: () => Promise<{ gateway: AgtxGateway; close: () => Promise<void> }>) {
 describe(name + ' gateway contract',() => {
  it('reads normalized health/project/tasks/pane and sends allowed keys',async () => {
   const { gateway, close } = await setup();
   try {
    expect(await gateway.getHealth()).toMatchObject({ version: '1.0.6', tuiConnected: true });
    expect(await gateway.resolveProject()).toMatchObject({ id: PROJECT_ID, name: 'agent-helm' });
    expect(await gateway.listTasks()).toMatchObject([{ id: TASK_ID, phaseStatus: 'working' }]);
    expect(await gateway.getTask(TASK_ID)).toMatchObject({ description: 'Foundation task', sessionName: 'test-session' });
    expect(await gateway.readPane(TASK_ID)).toMatchObject({ text: 'Hello', source: 'agtx' });
    expect(await gateway.sendKey(TASK_ID,'Enter')).toEqual({ outcome: 'sent' });
   } finally { await close(); }
  });
  it('rejects disallowed keys, malformed IDs and missing tasks',async () => {
   const { gateway, close } = await setup();
   try {
    for (const key of ['C-c','a','4','x']) expect(await gateway.sendKey(TASK_ID,key as AgtxKey)).toEqual({ outcome: 'rejected', reason: 'key_not_allowed' });
    for (const id of ['../escape','not-uuid']) {
     await expect(gateway.getTask(id)).rejects.toMatchObject({ kind: 'not_found' });
     await expect(gateway.readPane(id)).rejects.toMatchObject({ kind: 'not_found' });
     await expect(gateway.sendKey(id,'y')).rejects.toMatchObject({ kind: 'not_found' });
    }
    await expect(gateway.getTask('33333333-3333-4333-8333-333333333333')).rejects.toMatchObject({ kind: 'not_found' });
   } finally { await close(); }
  });
 });
}
