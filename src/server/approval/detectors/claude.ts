import { detectNumbered } from './numbered.js';
import { detectSelector } from './selector.js';
export const detectClaude = (lines: string[], capturedAt: string) => detectNumbered(lines,capturedAt,'claude',/^(?:Do you want to |Do you trust the files in this folder|Would you like to |.*trust this folder)/i);
export const detectClaudeSelector = (lines: string[], capturedAt: string) => detectSelector(lines,capturedAt,'claude');
