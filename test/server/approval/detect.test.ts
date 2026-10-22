import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectApproval, toApprovalPrompt } from '../../../src/server/approval/index.js';
const capturedAt = '2026-10-21T00:00:00Z';
const fixture = (name: string) => readFileSync('test/fixtures/panes/' + name + '.txt','utf8');
const detect = (text: string, agentHint?: string) => detectApproval(text,{ capturedAt, agentHint });
describe('approval detection',() => {
 it.each([
  ['codex-exec-approval','codex','approval',3], ['codex-trust','codex','trust',2],
  ['claude-bash-approval.estimated','claude','approval',3], ['claude-bash-approval-noframe.estimated','claude','approval',3],
  ['claude-trust.estimated','claude','trust',2], ['claude-edit-four-options.estimated','claude','approval',4],
  ['generic-yn','generic','approval',2], ['generic-yesno','generic','approval',2]
 ])('detects %s',(name,agentKind,kind,count) => {
  const prompt = detect(fixture(String(name)));
  expect(prompt).toMatchObject({ agentKind, kind, capturedAt });
  expect(prompt?.question).toContain('?'); expect(prompt?.options).toHaveLength(Number(count));
  expect(prompt?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
 });
 it('extracts detail, shortcuts and warnings',() => {
  const prompt = detect(fixture('codex-exec-approval'))!;
  expect(prompt.detail).toBe('Reason: Run the project tests\n$ pnpm test');
  expect(prompt.options).toMatchObject([
   { key: '1', shortcut: 'y', label: 'Yes, proceed', meaning: 'approve', warn: false },
   { key: '2', shortcut: 'p', meaning: 'approve_always', warn: true },
   { key: '3', shortcut: 'esc', meaning: 'deny', warn: false }
  ]);
 });
 it.each(['codex-normal-working','claude-normal-history','codex-idle-input','shell-prompt'])('rejects %s',name => expect(detect(fixture(name))).toBeNull());
 it('ignores formatting and cursor movement but includes command and question changes',() => {
  const text = fixture('codex-exec-approval'); const hash = detect(text)!.fingerprint;
  for (const changed of [text,text.replace('› 1.','  1.').replace('  2.','› 2.'),'\x1b[32m' + text + '\x1b[0m',text.split('\n').map(line => '│ ' + line + ' │').join('\n')]) expect(detect(changed)!.fingerprint).toBe(hash);
  for (const changed of [text.replace('following command','next command'),text.replace('$ pnpm test','$ pnpm build')]) expect(detect(changed)!.fingerprint).not.toBe(hash);
  expect(detect(fixture('claude-bash-approval.estimated'))!.fingerprint).toBe(detect(fixture('claude-bash-approval-noframe.estimated'))!.fingerprint);
 });
 it('enforces target keys and blocks full-word responses',() => {
  const raw = detect(fixture('claude-edit-four-options.estimated'))!;
  expect(toApprovalPrompt(raw,'task').options[3]).toMatchObject({ sendable: false, unsendableReason: 'key_not_in_target_set' });
  expect(toApprovalPrompt(raw,'orchestrator').options[3]?.sendable).toBe(true);
  expect(toApprovalPrompt(detect(fixture('generic-yesno'))!,'task').options.every(option => !option.sendable)).toBe(true);
  expect(toApprovalPrompt(detect(fixture('generic-yn'))!,'task').options.every(option => option.sendable)).toBe(true);
 });
 it('requires a terminal, sequential option block and uses only the last 40 lines',() => {
  const text = fixture('codex-exec-approval');
  for (const changed of [text + 'Done\n',text + '> \n',text.replace('2. Yes','4. Yes'),text.replace('$ pnpm test','$ pnpm test' + '\nline'.repeat(40))]) expect(detect(changed)).toBeNull();
 });
 it('ignores trailing blank pane rows and extended footers',() => {
  expect(detect(fixture('codex-exec-approval') + '\n'.repeat(60))?.agentKind).toBe('codex');
  expect(detect(fixture('claude-bash-approval-noframe.estimated') + '\nEsc to cancel · Tab to amend\n','claude')?.options).toHaveLength(3);
 });
 it('joins wrapped questions and options',() => {
  const text = 'Would you like to run\nthe following command?\n› 1. Yes, proceed\n  2. Yes, and do not ask again\n     for this command (p)\n';
  expect(detect(text)).toMatchObject({ question: 'Would you like to run the following command?', options: [{ key: '1' },{ label: 'Yes, and do not ask again for this command', shortcut: 'p', warn: true }] });
 });
 it('ignores cursor markers in earlier output',() => {
  expect(detect('❯ previous input\n' + fixture('codex-exec-approval'))?.agentKind).toBe('codex');
 });
 it('prefers the latest prompt and uses hints only for ties',() => {
  expect(detect(fixture('codex-exec-approval') + '\nOverwrite? [y/N]','codex')?.agentKind).toBe('generic');
  expect(detect('Do you want to proceed?\n1. Yes\n2. No','codex')?.agentKind).toBe('codex');
 });
});

it('detects real Claude 2.1.307 and Codex 0.156.1 permission screens', () => {
 const claude = fixture('claude-bash-approval.real');
 const actual = detect(claude, 'claude')!;
 expect(actual).toMatchObject({ agentKind: 'claude', kind: 'approval' });
 expect(actual.options.map(o => o.meaning)).toEqual(['approve', 'deny']);
 expect(actual.detail).toContain('ls');
 expect(detect(claude.replace(' ls\n', ' pwd\n'))?.fingerprint).not.toBe(actual.fingerprint);
 expect(detect(fixture('claude-bash-approval.estimated').replace('pnpm test', 'pnpm build'))?.fingerprint)
  .not.toBe(detect(fixture('claude-bash-approval.estimated'))?.fingerprint);
 expect(detect(fixture('codex-exec-approval.real'))).toMatchObject({ agentKind: 'codex', kind: 'approval' });
 expect(detect(fixture('codex-trust.real'))).toMatchObject({ agentKind: 'codex', kind: 'trust' });
 // Claude's new unnumbered trust selector has no stable single-key mapping.
 expect(detect(fixture('claude-trust.real'))).toMatchObject({agentKind:'claude',kind:'trust',terminalOnly:true,options:[]});
});

it('recognizes terminal selectors without treating cursor movement as a new prompt',()=> {
 const text = fixture('claude-trust.real'); const raw = detect(text)!;
 expect(raw.question).toContain('trust'); expect(raw.fingerprint).toMatch(/^[a-f0-9]{64}$/);
 expect(toApprovalPrompt(raw,'task').terminalOnly).toBe(true);
 expect(detect(text.replace('❯ No','  No').replace('   Yes',' ❯ Yes'))?.fingerprint).toBe(raw.fingerprint);
 expect(detect(text.replace('/path/to/','/another/'))?.fingerprint).not.toBe(raw.fingerprint);
 for (const changed of [text.replace('Enter to confirm','Confirm'),text.replace('   Yes',' ❯ Yes'),text.replace('No, exit','1. No, exit')]) expect(detect(changed)).toBeNull();
});
it.each([12,13])('bounds command lookback at %s lines',distance=> {
 const text = 'Bash command\n old cmd\n' + 'output\n'.repeat(distance-2) + 'Do you want to proceed?\n❯ 1. Yes\n  2. No\n';
 const raw = detect(text)!;
 expect(raw.detail?.includes('old cmd') ?? false).toBe(distance===12);
 expect(detect(text.replace('old cmd','changed'))?.fingerprint===raw.fingerprint).toBe(distance!==12);
});
