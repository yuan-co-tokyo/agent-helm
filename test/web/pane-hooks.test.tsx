// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { usePaneScreenPolling } from '../../src/web/hooks/usePaneScreenPolling.js';
import { useStickToBottom } from '../../src/web/hooks/useStickToBottom.js';
afterEach(()=> { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
test('polls without overlap, backs off, retains data and pauses when hidden',async()=> {
 vi.useFakeTimers();
 let visible = 'visible'; vi.spyOn(document,'visibilityState','get').mockImplementation(()=>visible as DocumentVisibilityState);
 const fetcher = vi.fn<()=>Promise<string>>().mockResolvedValue('first');
 const {result,unmount} = renderHook(()=>usePaneScreenPolling(fetcher));
 await act(async()=>{}); expect(result.current.data).toBe('first');
 fetcher.mockRejectedValue(new Error('offline'));
 await act(async()=> { await vi.advanceTimersByTimeAsync(1500); });
 expect(result.current.stale).toBe(true); expect(result.current.data).toBe('first');
 await act(async()=> { await vi.advanceTimersByTimeAsync(2999); }); expect(fetcher).toHaveBeenCalledTimes(2);
 await act(async()=> { await vi.advanceTimersByTimeAsync(1); }); expect(fetcher).toHaveBeenCalledTimes(3);
 visible='hidden'; act(()=>document.dispatchEvent(new Event('visibilitychange')));
 await act(async()=> { await vi.advanceTimersByTimeAsync(60000); }); expect(fetcher).toHaveBeenCalledTimes(3);
 let resolve!:(value:string)=>void; fetcher.mockImplementation(()=>new Promise(done=> {resolve=done;}));
 visible='visible'; act(()=>document.dispatchEvent(new Event('visibilitychange'))); expect(fetcher).toHaveBeenCalledTimes(4);
 act(()=> { result.current.refresh(); result.current.refresh(); });
 await act(async()=> { await vi.advanceTimersByTimeAsync(30000); }); expect(fetcher).toHaveBeenCalledTimes(4);
 unmount(); await act(async()=>resolve('late')); expect(result.current.data).toBe('first');
});
test('caps retry delay at fifteen seconds and resumes immediately',async()=> {
 vi.useFakeTimers(); const fetcher = vi.fn<()=>Promise<string>>().mockRejectedValue(new Error('offline'));
 const {result} = renderHook(()=>usePaneScreenPolling(fetcher)); await act(async()=>{});
 for (const delay of [3000,6000,12000,15000,15000]) {
  const calls = fetcher.mock.calls.length;
  await act(async()=> { await vi.advanceTimersByTimeAsync(delay-1); }); expect(fetcher).toHaveBeenCalledTimes(calls);
  await act(async()=> { await vi.advanceTimersByTimeAsync(1); }); expect(fetcher).toHaveBeenCalledTimes(calls+1);
 }
 fetcher.mockResolvedValue('recovered'); act(()=>result.current.refresh()); await act(async()=>{});
 expect(result.current.stale).toBe(false); expect(result.current.data).toBe('recovered');
});
test('scroll follows output only while pinned',()=> {
 const {result,rerender} = renderHook(({text})=>useStickToBottom(text),{initialProps:{text:'first'}});
 const rendered = render(<pre ref={result.current.ref} />);
 const element = rendered.container.querySelector('pre')!;
 Object.defineProperties(element,{scrollHeight:{value:1000},clientHeight:{value:100}});
 rerender({text:'second'}); expect(element.scrollTop).toBe(1000);
 element.scrollTop=200; act(()=>result.current.onScroll()); rerender({text:'third'});
 expect(element.scrollTop).toBe(200); expect(result.current.pinned).toBe(false);
 act(()=>result.current.jump()); expect(element.scrollTop).toBe(1000);
});

test('tracks request starts across failures and effect restarts',async()=> {
 vi.useFakeTimers(); const fetcher = vi.fn<()=>Promise<string>>().mockResolvedValue('first');
 const {result,rerender} = renderHook(({enabled})=>usePaneScreenPolling(fetcher,1500,enabled),{initialProps:{enabled:true}});
 await act(async()=>{}); expect(result.current.seq).toBe(1); expect(result.current.startedSeq()).toBe(1);
 fetcher.mockRejectedValueOnce(new Error('offline'));
 await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
 expect(result.current.seq).toBe(1); expect(result.current.startedSeq()).toBe(2);
 rerender({enabled:false}); rerender({enabled:true}); await act(async()=>{});
 expect(result.current.seq).toBe(3); expect(result.current.startedSeq()).toBe(3);
});
