import type { ApprovalPrompt, PrInfo } from '../../shared/api.js';
export interface ApprovalDetector { detect(paneText: string, capturedAt: string, agentHint?: string | null): ApprovalPrompt | null }
export interface PrLookup { lookup(url: string | null, number: number | null, opts?: { wait?: boolean; branch?: string | null; cwd?: string | null }): Promise<PrInfo> }
export interface StatusClock { now(): number }
