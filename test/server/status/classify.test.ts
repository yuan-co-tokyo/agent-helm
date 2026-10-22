import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import type { TaskDetail } from '../../../src/server/agtx/types.js';
import { attentionFor, classifyTask, inputState, needsDetail, needsPaneCheck } from '../../../src/server/status/classify.js';
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
 const input = {task:current,approval:null,agtxTuiConnected:true,disconnected:false,input:'empty' as const};
 expect(classifyTask(input)).toBe(agent ? 'awaiting_input' : 'error');
 expect(classifyTask({...input,approval:prompt})).toBe('approval');
 expect(attentionFor(current,'awaiting_input',null)).toEqual({reason:'入力待ち（agtx は exited と報告）',item:null});
});

it.each([
 ['codex-idle-input','empty'] // Exact known placeholder, not typed input.
 , ['shell-prompt',null], ['codex-exec-approval.real',null], ['codex-trust.real',null]
])('recognizes input readiness from %s', (name,expected)=> {
 expect(inputState(readFileSync(`test/fixtures/panes/${name}.txt`,'utf8'))).toBe(expected);
});
it('excludes menus and completions from input waiting',()=> {
 for (const text of ['❯ 1. One\n  2. Two','❯ \n /help']) expect(inputState(text)).toBe(null);
});

it.each(['❯ ', '› ', '❯ abc', '› Ask Codex…'])('distinguishes empty and nonempty input: %s', text => {
 const current = task({phaseStatus:'exited',agent:'codex'});
 const state = classifyTask({task:current,approval:null,agtxTuiConnected:true,disconnected:false,input:inputState(text)});
 expect(state).toBe(text.trim().length === 1 ? 'awaiting_input' : 'input_pending');
 expect(attentionFor(current,state,null).item?.kind ?? null).toBe(state === 'input_pending' ? 'input' : null);
});

it.each(['done','backlog'] as const)('keeps %s out of runtime attention and pane reads', status => {
 for (const phaseStatus of ['idle','blocked'] as const) {
  const current = task({ status, phaseStatus, tuiConnected: false, phaseAgeSecs: 3600, escalationNote: 'old', depsSatisfied: false });
  const args = { task: current, approval: prompt, agtxTuiConnected: false, disconnected: false };
  expect(classifyTask(args)).toBe(status);
  expect(classifyTask({ ...args, disconnected: true })).toBe('disconnected');
  expect(attentionFor(current,status,null).item).toBeNull();
  expect(needsPaneCheck(current,{})).toBe(false);
 }
});
it.each(['Ask Codex to do anything','Implement {feature}','Explain this codebase','Try "fix lint errors"'])('recognizes exact placeholder %s', text => {
 expect(inputState(`› ${text}`)).toBe('empty');
 expect(inputState(`› ${text} extra`)).toBe('not_empty');
 // SGR evidence overrides text fallback: normal-colored text is actual input.
 expect(inputState(`› ${text}`, `› ${text}`)).toBe('not_empty');
});
it('uses style evidence without removing approval or completion guards', () => {
 expect(inputState('› placeholder','› ')).toBe('empty');
 expect(inputState('› placeholder','› typed')).toBe('not_empty');
 expect(inputState('› Ask Codex…')).toBe('not_empty');
 expect(inputState('› unknown')).toBe('not_empty');
});
it.each(['codex','claude'])('recognizes estimated %s ANSI fixture', async agent => {
 const { stripAnsi,stripFaint } = await import('../../../src/server/text.js');
 const raw = readFileSync(`test/fixtures/panes/${agent}-placeholder.estimated.ansi.txt`,'utf8');
 expect(inputState(stripAnsi(raw),stripFaint(raw))).toBe('empty');
});
