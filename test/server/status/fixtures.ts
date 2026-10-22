import { detailSchema } from '../../../src/server/agtx/schemas.js';
import type { TaskDetail } from '../../../src/server/agtx/types.js';
import type { ApprovalPrompt } from '../../../src/shared/api.js';
import { taskFixture } from '../../mock-agtx/fixtures.js';
export const task = (patch: Partial<TaskDetail> = {}): TaskDetail => ({ ...detailSchema.parse(taskFixture), ...patch });
export const prompt: ApprovalPrompt = { agentKind: 'codex', question: 'Allow?', options: [], fingerprint: 'test', capturedAt: '2026-01-01T00:00:00Z' };
