import { detectNumbered } from './numbered.js';
export const detectCodex = (lines: string[], capturedAt: string) => detectNumbered(lines,capturedAt,'codex',/^(?:Would you like to |Allow |Do you want to |Trust this folder)/i);
