import { expect, it } from 'vitest';
import { stripAnsi } from '../../src/server/text.js';
import { redact } from '../../src/server/log.js';
it('removes CSI, OSC, escape and control characters while preserving text',() => {
 expect(stripAnsi('\x1b[31mRed\x1b[0m\x1b]0;title\x07\x00\r\n\tOK\x1b7')).toBe('Red\n\tOK');
});
it('redacts to length and short hash',() => {
 expect(redact('secret')).toEqual({ len: 6, sha256: '2bb80d537b1d' });
});

it.each(['2','90','38;5;8','38;5;245','38;2;128;130;128'])('filters faint prompt content (%s), preserving history', async code => {
 const { stripFaint } = await import('../../src/server/text.js');
 expect(stripFaint(`\x1b[${code}mhistory\x1b[0m\n› \x1b[${code}mplaceholder\x1b[0m`)).toBe('history\n› ');
 expect(stripFaint(`› \x1b[${code}mplaceholder\x1b[0mtyped`)).toBe('› typed');
});
it('handles resets and leaves normal foreground and background colors intact', async () => {
 const { stripFaint } = await import('../../src/server/text.js');
 expect(stripFaint('› plain')).toBeNull();
 for (const reset of ['0','']) expect(stripFaint(`› \x1b[2mghost\x1b[${reset}mtyped`)).toBe('› typed');
 expect(stripFaint('› \x1b[2mghost\x1b[22mtyped')).toBe('› typed');
 expect(stripFaint('› \x1b[90mghost\x1b[39mtyped')).toBe('› typed');
 for (const color of ['31','38;5;120','38;2;128;0;128','48;5;245','48;2;128;128;128']) expect(stripFaint(`› \x1b[${color}mtyped`)).toBe('› typed');
 expect(stripFaint('\x1b[2m› ghost')).toBe('›');
});
it('drops an inverse cursor cell only when it starts faint placeholder text', async () => {
 const { stripFaint } = await import('../../src/server/text.js');
 expect(stripFaint('❯ \x1b[7mT\x1b[27m\x1b[90mry "fix lint errors"\x1b[39m')).toBe('❯ ');
 expect(stripFaint('❯ \x1b[7mT\x1b[0m\x1b[2mry\x1b[0m')).toBe('❯ ');
 expect(stripFaint('❯ typed\x1b[7m \x1b[27m')).toBe('❯ typed ');
 expect(stripFaint('❯ \x1b[7ma\x1b[27mb')).toBe('❯ ab');
});
