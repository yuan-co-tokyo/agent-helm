import { isUuid } from '../../shared/constants.js';
export function projectPath(projectId: string, ...segments: string[]) {
 if (!isUuid(projectId) || (segments[0] === 'tasks' && segments[1] !== undefined && !isUuid(segments[1]))) throw new Error('Invalid project or task ID');
 return '/api/projects/' + encodeURIComponent(projectId) + (segments.length ? '/' + segments.map(encodeURIComponent).join('/') : '');
}
