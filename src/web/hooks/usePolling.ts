import { useEffect, useRef, useState } from 'react';
import type { StateResponse, TaskDetailView } from '../../shared/api.js';
import { isUuid } from '../../shared/constants.js';
export interface ReadApi { apiGet<T>(path: string): Promise<T> }
interface PollState<T> { data: T | null; lastSuccessAt: Date | null; error: Error | null; connected: boolean; failures: number }
function initial<T>(): PollState<T> { return { data: null, lastSuccessAt: null, error: null, connected: false, failures: 0 }; }
export function usePolling<T>(fetcher: () => Promise<T>, { intervalMs, maxBackoffMs = 15000, enabled = true, key }: { intervalMs: number; maxBackoffMs?: number; enabled?: boolean; key?: string | null }) {
 const fetchRef = useRef(fetcher);
 useEffect(() => { fetchRef.current = fetcher; },[fetcher]);
 const [snapshot,setSnapshot] = useState<{ key: typeof key; value: PollState<T> }>({ key, value: initial<T>() });
 useEffect(() => {
  let active = true;
  let inFlight = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rerunOnVisible = false;
  const isHidden = () => document.visibilityState === 'hidden';
  let value = initial<T>();
  function publish() { setSnapshot({ key, value }); }
  async function poll() {
   if (!active || !enabled || inFlight || isHidden()) return;
   inFlight = true;
   try {
    const data = await fetchRef.current();
    if (!active) return;
    failures = 0;
    value = { data, lastSuccessAt: new Date(), error: null, connected: true, failures };
   } catch (error) {
    if (!active) return;
    failures++;
    value = { ...value, error: error instanceof Error ? error : new Error(String(error)), connected: false, failures };
   } finally {
    inFlight = false;
    if (active) {
     publish();
     if (rerunOnVisible && !isHidden()) { rerunOnVisible = false; void poll(); }
     else if (!isHidden()) timer = setTimeout(() => { void poll(); },Math.min(intervalMs * 2 ** Math.min(failures,30),maxBackoffMs));
    }
   }
  }
  function visibility() { clearTimeout(timer); if (!isHidden()) { if (inFlight) rerunOnVisible = true; else void poll(); } }
  publish();
  if (enabled) { void poll(); document.addEventListener('visibilitychange',visibility); }
  return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange',visibility); };
 },[intervalMs,maxBackoffMs,enabled,key]);
 return snapshot.key === key && enabled ? snapshot.value : initial<T>();
}
export function useAppState(api: ReadApi) { return usePolling(() => api.apiGet<StateResponse>('/api/state'),{ intervalMs: 3000 }); }
export function useTaskDetail(api: ReadApi, taskId: string | null) { return usePolling(() => api.apiGet<TaskDetailView>(`/api/tasks/${taskId}`),{ intervalMs: 1500, enabled: !!taskId && isUuid(taskId), key: taskId }); }
