import { useEffect, useRef, useState, useCallback } from 'react';
const isVisible = () => document.visibilityState !== 'hidden';
export function usePaneScreenPolling<T>(fetcher:()=>Promise<T>, intervalMs = 1500, enabled = true) {
 const [snapshot,setSnapshot] = useState<{data:T|null; error:unknown; lastSuccessAt:string|null;revision:number}>({data:null,error:null,lastSuccessAt:null,revision:0});
 const refreshRef = useRef<()=>void>(()=>{});
 useEffect(()=> {
  let active = true, busy = false, pending = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function run() {
   clearTimeout(timer);
   if (!active || !enabled || !isVisible()) return;
   if (busy) { pending = true; return; }
   busy = true;
   try {
    const data = await fetcher();
    if (active) { failures = 0; setSnapshot(previous=>({data,error:null,lastSuccessAt:new Date().toISOString(),revision:previous.revision+1})); }
   } catch(error) {
    if (active) { failures++; setSnapshot(previous=>({...previous,error})); }
   } finally {
    busy = false;
    if (active && isVisible()) {
     timer = setTimeout(()=>void run(), pending ? 0 : Math.min(intervalMs * 2 ** failures,15000));
     pending = false;
    }
   }
  }
  function visibility() { clearTimeout(timer); if (isVisible()) void run(); }
  refreshRef.current = ()=>void run();
  document.addEventListener('visibilitychange',visibility);
  void run();
  return ()=> { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange',visibility); };
 },[fetcher,intervalMs,enabled]);
 const refresh = useCallback(()=>refreshRef.current(),[]);
 return {...snapshot,stale:snapshot.error !== null,refresh};
}
