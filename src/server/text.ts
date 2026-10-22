import { stripVTControlCharacters } from 'node:util';
export function stripAnsi(text: string): string {
 return [...stripVTControlCharacters(text)].filter(c => c === '\n' || c === '\t' || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127 && !(c.charCodeAt(0) >= 128 && c.charCodeAt(0) <= 159))).join('');
}

// Preserve prompt markers and line boundaries even when the terminal dims the whole prompt.
export function stripFaint(raw: string): string | null {
 // eslint-disable-next-line no-control-regex -- SGR escape sequences are the parsing input.
 const sgr = /\x1b\[([0-9;]*)m/g;
 if (!sgr.test(raw)) return null;
 sgr.lastIndex = 0;
 let dim = false; let gray = false; let offset = 0; let result = '';
 const append = (text: string) => { result += dim || gray ? text.replace(/[^\n❯›]/g, '') : text; };
 for (const match of raw.matchAll(sgr)) {
  append(raw.slice(offset, match.index));
  const codes = match[1]!.split(';').map(Number);
  for (let i = 0; i < codes.length; i++) {
   const code = codes[i];
   if (code === 0) { dim = false; gray = false; }
   else if (code === 2) dim = true;
   else if (code === 22) dim = false;
   else if (code === 39) gray = false;
   else if (code === 90) gray = true;
   else if (code === 38 || code === 48 || code === 58) {
    const mode = codes[++i]; let faint = false;
    if (mode === 5) { const n = codes[++i]!; faint = n === 8 || (n >= 240 && n <= 250); }
    else if (mode === 2) {
     const rgb = codes.slice(i + 1, i + 4); i += 3;
     faint = rgb.length === 3 && Math.min(...rgb) >= 96 && Math.max(...rgb) <= 176 && Math.max(...rgb) - Math.min(...rgb) <= 10;
    }
    if (code === 38) gray = faint;
   } else if (code !== undefined && ((code >= 30 && code <= 37) || (code >= 91 && code <= 97))) gray = false;
  }
  offset = match.index + match[0].length;
 }
 append(raw.slice(offset));
 const original = stripAnsi(raw).split('\n');
 const filtered = stripAnsi(result).split('\n');
 return original.map((line, i) => /^\s*[│ ]*[❯›]/.test(line) ? filtered[i] ?? '' : line).join('\n');
}
