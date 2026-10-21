// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DISPLAY_STATES } from '../../src/shared/api.js';
import { DISPLAY_STATE_LABELS } from '../../src/web/state/labels.js';
import { StatusBadge } from '../../src/web/components/StatusBadge.js';
afterEach(cleanup);
describe('StatusBadge', () => {
 it('shows a text label and state for every display state', () => {
  for (const state of DISPLAY_STATES) {
   const { container, unmount } = render(<StatusBadge state={state} />);
   expect(screen.getByText(new RegExp(DISPLAY_STATE_LABELS[state].label))).toBeTruthy();
   expect(container.querySelector(`[data-state="${state}"]`)).toBeTruthy();
   unmount();
  }
 });
});
