import { detectNumbered } from './numbered.js';
export const detectClaude = (lines: string[], capturedAt: string) => detectNumbered(lines,capturedAt,'claude',/^(?:Do you want to |Do you trust the files in this folder|Would you like to |.*trust this folder)/i);
