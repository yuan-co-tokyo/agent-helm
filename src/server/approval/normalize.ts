import { createHash } from 'node:crypto';
import { stripAnsi } from '../text.js';
export const tailLines = (text: string, count = 40) => stripAnsi(text).replace(/\r\n?/g,'\n').replace(/\s+$/,'').split('\n').slice(-count);
export const stripFrame = (line: string) => line.replace(/^[\s│┃╭╮╰╯─━]+|[\s│┃╭╮╰╯─━]+$/g,'');
export const normalizeRegion = (lines: string[]) => lines.map(line => stripFrame(line).replace(/^[❯›>▶]\s*/,'').replace(/\s+/g,' ').trim()).filter(Boolean);
export const fingerprint = (lines: string[]) => createHash('sha256').update(normalizeRegion(lines).join('\n')).digest('hex');
