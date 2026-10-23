import { useEffect, useState } from 'react';
import { isUuid } from '../../shared/constants.js';
export function parseHash(hash: string): { view: 'projects' } | { view: 'project'; projectId: string } {
 const match = /^#\/p\/([^/]+)$/.exec(hash);
 return match && isUuid(match[1]!) ? { view: 'project', projectId: match[1]! } : { view: 'projects' };
}
export function useHashRoute() {
 const [route,setRoute] = useState(() => parseHash(location.hash));
 useEffect(() => { const change = () => setRoute(parseHash(location.hash)); window.addEventListener('hashchange',change); return () => window.removeEventListener('hashchange',change); },[]);
 return route;
}
export function navigate(hash: string) { location.hash = hash; }
