import { describe, expect, it } from 'vitest';
import { DISPLAY_STATES, PR_DISPLAY_STATES } from '../../src/shared/api.js';
import { ATTENTION_KIND_LABELS, DISPLAY_STATE_LABELS, formatTime, isSafeHttpUrl, PR_STATE_LABELS } from '../../src/web/state/labels.js';
import { stripControl } from '../../src/web/text.js';
describe('web labels and text safety', () => {
 it('labels every display and PR state plus attention kinds', () => {
  for (const state of DISPLAY_STATES) expect(DISPLAY_STATE_LABELS[state].label.length).toBeGreaterThan(0);
  for (const state of PR_DISPLAY_STATES) expect(PR_STATE_LABELS[state].length).toBeGreaterThan(0);
  expect(Object.keys(ATTENTION_KIND_LABELS)).toHaveLength(6);
 });
 it('formats local time and rejects invalid values', () => {
  const date = new Date('2026-01-02T03:04:05Z');
  expect(formatTime(date)).toBe([date.getHours(),date.getMinutes(),date.getSeconds()].map(n => String(n).padStart(2,'0')).join(':'));
  expect(formatTime('bad')).toBe('--:--:--');
 });
 it('allows only HTTP links and strips terminal controls', () => {
  expect(isSafeHttpUrl('https://example.com')).toBe(true);
  expect(isSafeHttpUrl('http://localhost')).toBe(true);
  expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
  expect(stripControl('\u001b[31mred\u001b[0m\nnext')).toBe('red\nnext');
 });
});
it('translates all known input reasons and provides a fallback',async()=> {
 const {INPUT_BLOCK_REASONS,inputBlockReason} = await import('../../src/web/state/labels.js');
 for (const code of Object.keys(INPUT_BLOCK_REASONS)) expect(inputBlockReason(code)).not.toContain(code);
 expect(inputBlockReason('future')).toBe('送信できない状態です（コード: future）');
 expect(DISPLAY_STATE_LABELS.input_pending.label).toBe('入力途中（入力欄に文字あり）');
 expect(DISPLAY_STATE_LABELS.awaiting_input.label).toBe('入力待ち（完了確認待ち）');
});
