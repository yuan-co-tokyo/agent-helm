import { expect, it } from 'vitest';
import { projectPath } from '../../src/web/api/paths.js';
import { parseHash } from '../../src/web/hooks/useHashRoute.js';
const id = '11111111-1111-4111-8111-111111111111';
it('requires valid project and task identifiers', () => {
 expect(projectPath(id,'tasks',id)).toBe(`/api/projects/${id}/tasks/${id}`);
 expect(() => projectPath('../','state')).toThrow();
 expect(() => projectPath(id,'tasks','../')).toThrow();
});
it('accepts only a project UUID route and falls back to the list', () => {
 expect(parseHash(`#/p/${id}`)).toEqual({ view: 'project', projectId: id });
 for (const hash of ['','#/','#/p/invalid',`#/p/${id}/extra`]) expect(parseHash(hash)).toEqual({ view: 'projects' });
});
