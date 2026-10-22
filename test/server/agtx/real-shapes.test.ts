import { expect, it } from 'vitest';
import { detailSchema, paneSchema } from '../../../src/server/agtx/schemas.js';
import { taskFixture } from '../../mock-agtx/fixtures.js';
it.each([[null, []], ['', []], ['a, b', ['a', 'b']], [['a'], ['a']]])('normalizes real referenced_tasks %j', (value, expected) => {
 expect(detailSchema.parse({ ...taskFixture, referenced_tasks: value }).referencedTasks).toEqual(expected);
});
it('reads the real pane envelope even when lines is a count', () => {
 expect(paneSchema.parse({ session_name: 'test', lines: 200, content: 'screen' })).toBe('screen');
});
