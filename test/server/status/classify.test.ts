import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { TaskDetail } from '../../../src/server/agtx/types.js';
import { attentionFor, classifyTask, isAwaitingInput, needsDetail, needsPaneCheck } from '../../../src/server/status/classify.js';
import { task, prompt } from './fixtures.js';
it.each<[Partial<TaskDetail>, string]>([
 [{ phaseAgeSecs: 30 },'running'], [{ phaseAgeSecs: 31 },'stale'], [{ tuiConnected: false },'stale'],
 [{ phaseStatus: 'blocked' },'blocked'], [{ agentState: 'blocked' },'blocked'],
 [{ status: 'planning', phaseStatus: 'exited' },'error'], [{ phaseStatus: 'exited' },'error'],
 [{ status: 'review', phaseStatus: 'exited' },'unknown'], [{ status: 'review' },'reviewing'],
 [{ phaseStatus: 'ready' },'phase_done'], [{ phaseStatus: 'idle' },'idle'], [{ phaseStatus: null },'unknown']
])('classifies %j as %s', (patch, expected) => {
 expect(classifyTask({ task: task(patch), approval: null, agtxTuiConnected: true, disconnected: false })).toBe(expected);
});
it('preserves priority across disconnect, stale, approval and blocked', () => {
 const input = { task: task({ phaseStatus: 'blocked' }), approval: prompt, agtxTuiConnected: true, disconnected: false };
 expect(classifyTask(input)).toBe('approval');
 expect(classifyTask({ ...input, agtxTuiConnected: false })).toBe('stale');
 expect(classifyTask({ ...input, task: task({ phaseAgeSecs: 31 }) })).toBe('stale');
 expect(classifyTask({ ...input, disconnected: true, agtxTuiConnected: false })).toBe('disconnected');
});
it('explains attention and avoids backlog dependency alerts', () => {
 expect(attentionFor(task(), 'blocked', null).reason).toBe('理由不明');
 expect(attentionFor(task({ blockedReason: 'wait' }), 'blocked', null).reason).toBe('wait');
 expect(attentionFor(task(), 'approval', prompt).item?.kind).toBe('approval');
 expect(attentionFor(task({ escalationNote: 'help' }), 'running', null).reason).toContain('help');
 expect(attentionFor(task({ depsSatisfied: false, blockingTasks: ['other'] }), 'running', null).item?.reason).toContain('other');
 expect(attentionFor(task({ depsSatisfied: false, status: 'backlog' }), 'unknown', null)).toMatchObject({ reason: expect.any(String), item: null });
 expect(attentionFor(task(), 'stale', null, false).reason).toBe('TUI未接続');
 expect(attentionFor(task(), 'stale', null, false).item?.kind).toBe('stale');
 expect(attentionFor(task({ status: 'done', phaseAgeSecs: 3600 }), 'stale', null)).toMatchObject({ reason: expect.any(String), item: null });
});
it('limits detail and pane work', () => {
 expect(needsDetail(task())).toBe(false);
 for (const patch of [{ phaseAgeSecs: 31 }, { phaseStatus: 'idle' as const }, { tuiConnected: false }, { depsSatisfied: false }, { escalationNote: 'help' }, { agentState: 'blocked' }]) expect(needsDetail(task(patch))).toBe(true);
 expect(needsDetail(task({ status: 'backlog', phaseAgeSecs: 31 }))).toBe(false);
 expect(needsPaneCheck(task({ phaseStatus: 'blocked' }), {})).toBe(true);
 expect(needsPaneCheck(task({ phaseStatus: 'blocked', sessionName: null }), {})).toBe(false);
 expect(needsPaneCheck(task({ phaseStatus: 'idle' }), null)).toBe(false);
 expect(needsPaneCheck(task(), {})).toBe(false);
});

it('explains terminal-only approval attention',()=> {
 expect(attentionFor(task(),'approval',{...prompt,terminalOnly:true}).item).toMatchObject({kind:'approval',reason:expect.stringContaining('この確認は端末（agtx TUI）で操作してください')});
});

it.each(['codex','claude',null])('only treats known exited agents as awaiting input: %s',agent=> {
 const current = task({agent,phaseStatus:'exited'});
 const input = {task:current,approval:null,agtxTuiConnected:true,disconnected:false,awaitingInput:true};
 expect(classifyTask(input)).toBe(agent ? 'awaiting_input' : 'error');
 expect(classifyTask({...input,approval:prompt})).toBe('approval');
 expect(attentionFor(current,'awaiting_input',null)).toEqual({reason:'入力待ち（agtx は exited と報告）',item:null});
});

it.each([
 ['codex-idle-input',true], ['shell-prompt',false], ['codex-exec-approval.real',false], ['codex-trust.real',false]
])('recognizes input readiness from %s', (name,expected)=> {
 expect(isAwaitingInput(readFileSync(`test/fixtures/panes/${name}.txt`,'utf8'))).toBe(expected);
});
it('excludes menus and completions from input waiting',()=> {
 for (const text of ['❯ 1. One\n  2. Two','❯ \n /help']) expect(isAwaitingInput(text)).toBe(false);
});
