import { z } from 'zod';
import { AGTX_KEYS, PHASE_STATUSES, TASK_STATUSES } from '../../shared/api.js';
import type { AgtxKey, PhaseStatus } from '../../shared/api.js';
import { isUuid } from '../../shared/constants.js';
import { GatewayError } from './types.js';
const nullableText = z.string().nullable().optional().transform(v => v ?? null);
const nullableNumber = z.number().nullable().optional().transform(v => v ?? null);
const nullableBool = z.boolean().nullable().optional().transform(v => v ?? null);
const strings = z.array(z.string()).optional().default([]);
export const projectSchema = z.object({ id: z.string().refine(isUuid), name: z.string(), path: nullableText }).transform(v => ({ id: v.id, name: v.name, path: v.path }));
export const healthSchema = z.object({ version: z.string(), mode: nullableText, project_count: nullableNumber, tui_connected: nullableBool });
const summaryFields = {
 id: z.string().refine(isUuid), title: z.string(), status: z.enum(TASK_STATUSES),
 agent: nullableText, plugin: nullableText, cycle: z.number().int().optional().default(0),
 branch_name: nullableText, pr_number: nullableNumber, pr_url: nullableText, escalation_note: nullableText,
 updated_at: nullableText, deps_satisfied: nullableBool, allowed_actions: strings,
 phase_status: nullableText, phase_age_secs: nullableNumber, conflicted: nullableBool,
 conflicting_files: strings, agent_state: nullableText, tui_connected: nullableBool
};
const summaryRaw = z.object(summaryFields);
function normalizeSummary(v: z.infer<typeof summaryRaw>) {
 return {
  id: v.id, title: v.title, status: v.status, agent: v.agent, plugin: v.plugin, cycle: v.cycle,
  branchName: v.branch_name, prNumber: v.pr_number, prUrl: v.pr_url, escalationNote: v.escalation_note,
  updatedAt: v.updated_at, depsSatisfied: v.deps_satisfied, allowedActions: v.allowed_actions,
  phaseStatus: (PHASE_STATUSES as readonly (string | null)[]).includes(v.phase_status) ? v.phase_status as PhaseStatus : null,
  phaseAgeSecs: v.phase_age_secs, conflicted: v.conflicted, conflictingFiles: v.conflicting_files,
  agentState: v.agent_state, tuiConnected: v.tui_connected
 };
}
export const summarySchema = summaryRaw.transform(normalizeSummary);
export const detailSchema = z.object({
 ...summaryFields, description: nullableText, worktree_path: nullableText, session_name: nullableText,
 base_branch: nullableText, referenced_tasks: strings, created_at: nullableText, blocked_reason: nullableText, blocking_tasks: strings
}).transform(v => ({
 ...normalizeSummary(v), description: v.description, worktreePath: v.worktree_path, sessionName: v.session_name,
 baseBranch: v.base_branch, referencedTasks: v.referenced_tasks, createdAt: v.created_at,
 blockedReason: v.blocked_reason, blockingTasks: v.blocking_tasks
}));
export const paneSchema = z.union([
 z.string(), z.object({ content: z.string() }).transform(v => v.content),
 z.object({ text: z.string() }).transform(v => v.text),
 z.object({ lines: z.array(z.string()) }).transform(v => v.lines.join('\n')),
 z.object({ output: z.string() }).transform(v => v.output)
]);
export function parseResponse<T>(schema: z.ZodType<T>, data: unknown): T {
 const result = schema.safeParse(data);
 if (!result.success) throw new GatewayError('bad_response');
 return result.data;
}
export const isAgtxKey = (key: string): key is AgtxKey => (AGTX_KEYS as readonly string[]).includes(key);
export function assertTaskId(id: string) { if (!isUuid(id)) throw new GatewayError('not_found'); }
export const clampLines = (lines = 200) => Number.isFinite(lines) ? Math.min(2000,Math.max(1,Math.floor(lines))) : 200;
