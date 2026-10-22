// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { OrchestratorConsole } from '../../src/web/components/OrchestratorConsole.js';
import { apiGet, apiPost, HelmApiError } from '../../src/web/api/client.js';
import type { OrchestratorScreenResponse, SessionResponse } from '../../src/shared/api.js';
import { isUuid } from '../../src/shared/constants.js';
vi.mock('../../src/web/api/client.js',async importOriginal=>({...await importOriginal<object>(),apiGet:vi.fn(),apiPost:vi.fn()}));
const pane:OrchestratorScreenResponse = {text:'terminal output',capturedAt:'2026-10-21T10:00:00Z',lines:1,source:'tmux',approval:null,inputReady:{ok:true}};
const session:SessionResponse = {csrfToken:'token',target:{project:{name:'Project',id:null},orchestrator:{socket:'sock',session:'sess',window:'win'}},versions:{app:'1',agtxSupported:'1',agtx:null}};
beforeEach(()=> { vi.mocked(apiGet).mockResolvedValue(pane); vi.mocked(apiPost).mockResolvedValue({outcome:'sent',requestId:'x'}); });
afterEach(()=> { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function setup(maxChars=8000) {
 render(<OrchestratorConsole session={session} maxChars={maxChars} status={{state:'running',target:session.target.orchestrator,paneId:'%7',currentCommand:null,checkedAt:pane.capturedAt}} />);
 await screen.findAllByText('terminal output');
 return screen.getByRole('textbox') as HTMLTextAreaElement;
}
test('shows destination and prevents over-limit input without truncation',async()=> {
 const input = await setup(3);
 expect(screen.getByText(/Project.*sock.*sess:win.*%7/)).toBeTruthy();
 fireEvent.change(input,{target:{value:'abcd'}});
 expect(input.value).toBe('abcd');
 expect((screen.getByRole('button',{name:'指示を送信'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.keyDown(input,{key:'Enter',ctrlKey:true});
 expect(apiPost).not.toHaveBeenCalled();
});
test('input readiness blocks sending',async()=> {
 vi.mocked(apiGet).mockResolvedValue({...pane,inputReady:{ok:false,reason:'処理中です'}});
 const input = await setup(); fireEvent.change(input,{target:{value:'hello'}});
 expect(screen.getByText('処理中です')).toBeTruthy();
 expect((screen.getByRole('button',{name:'指示を送信'}) as HTMLButtonElement).disabled).toBe(true);
});
test('guards duplicate submission and ignores IME',async()=> {
 vi.mocked(apiPost).mockReturnValue(new Promise(()=>{}));
 const input = await setup(); fireEvent.change(input,{target:{value:'hello'}});
 fireEvent.keyDown(input,{key:'Enter',ctrlKey:true,isComposing:true}); expect(apiPost).not.toHaveBeenCalled();
 const button = screen.getByRole('button',{name:'指示を送信'});
 fireEvent.click(button); fireEvent.click(button); expect(apiPost).toHaveBeenCalledTimes(1);
});
test('shortcuts send distinct UUIDs and describe sent accurately',async()=> {
 const input = await setup();
 for (const modifier of ['ctrlKey','metaKey']) {
  fireEvent.change(input,{target:{value:'hello\nworld'}}); fireEvent.keyDown(input,{key:'Enter',[modifier]:true});
  await waitFor(()=>expect(input.value).toBe(''));
 }
 const bodies = vi.mocked(apiPost).mock.calls.map(call=>call[1] as {requestId:string;text:string});
 expect(bodies).toHaveLength(2); expect(bodies.every(body=>isUuid(body.requestId))).toBe(true);
 expect(bodies[0]?.requestId).not.toBe(bodies[1]?.requestId);
 expect(screen.getByText('ペインに入力しました（受理・完了は画面で確認）')).toBeTruthy();
});
test('unknown outcome preserves input and never retries',async()=> {
 const input = await setup(); vi.useFakeTimers(); vi.mocked(apiPost).mockRejectedValue(new HelmApiError(0,'network'));
 fireEvent.change(input,{target:{value:'keep me'}}); fireEvent.click(screen.getByRole('button',{name:'指示を送信'}));
 await act(async()=>{}); await act(async()=> { await vi.advanceTimersByTimeAsync(30000); });
 expect(screen.getByText(/結果不明: 再送せず/)).toBeTruthy(); expect(input.value).toBe('keep me'); expect(apiPost).toHaveBeenCalledTimes(1);
});
const approvalPane:OrchestratorScreenResponse = {...pane,inputReady:{ok:false},approval:{agentKind:'claude',kind:'approval',question:'Original?',detail:null,capturedAt:pane.capturedAt,fingerprint:'original',options:[{key:'1',label:'Yes',meaning:'approve',shortcut:null,warn:false,sendable:true}]}};
const optionButton = ()=>screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement;
async function approvalSetup() {
 vi.useFakeTimers(); vi.mocked(apiGet).mockResolvedValue(approvalPane);
 render(<OrchestratorConsole session={session} />); await act(async()=>{});
}
function confirmApproval() { fireEvent.click(optionButton()); fireEvent.click(screen.getByRole('button',{name:'送信'})); }
test('shares one screen poll and freezes the selected fingerprint while polling',async()=> {
 await approvalSetup(); expect(apiGet).toHaveBeenCalledTimes(1);
 fireEvent.click(optionButton());
 vi.mocked(apiGet).mockResolvedValue({...approvalPane,approval:{...approvalPane.approval!,question:'Changed?',fingerprint:'changed'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(1500);}); expect(apiGet).toHaveBeenCalledTimes(2);
 expect(screen.queryByText('Changed?')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'送信'})); await act(async()=>{});
 expect(apiPost).toHaveBeenCalledWith('/api/approvals/respond',expect.objectContaining({fingerprint:'original'}));
});
test('holds unknown prompts through polls and failed verification',async()=> {
 await approvalSetup(); vi.mocked(apiPost).mockRejectedValue(new HelmApiError(0,'network'));
 confirmApproval(); await act(async()=>{});
 vi.mocked(apiGet).mockResolvedValue({...approvalPane,approval:{...approvalPane.approval!,question:'Changed?',fingerprint:'changed'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
 expect(optionButton().disabled).toBe(true); expect(screen.getByText('Original?')).toBeTruthy(); expect(screen.queryByText('Changed?')).toBeNull();
 vi.mocked(apiGet).mockRejectedValueOnce(new HelmApiError(0,'network'));
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect(optionButton().disabled).toBe(true); expect(screen.getByText('Original?')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect(optionButton().disabled).toBe(false); expect(screen.getByText('Changed?')).toBeTruthy(); expect(apiPost).toHaveBeenCalledTimes(1);
});
test.each(['sent','stale'])('keeps actions blocked after %s until a later-started poll completes',async outcome=> {
 await approvalSetup();
 let finishSend!:(value:unknown)=>void, rejectSend!:(error:Error)=>void;
 vi.mocked(apiPost).mockImplementation(()=>new Promise((resolve,reject)=>{finishSend=resolve;rejectSend=reject;}));
 let finishOld!:(value:unknown)=>void, finishNew!:(value:unknown)=>void;
 vi.mocked(apiGet).mockImplementationOnce(()=>new Promise(resolve=>{finishOld=resolve;})).mockImplementationOnce(()=>new Promise(resolve=>{finishNew=resolve;}));
 confirmApproval();
 await act(async()=>{await vi.advanceTimersByTimeAsync(1500);});
 await act(async()=>{if (outcome==='stale') rejectSend(new HelmApiError(409,'stale')); else finishSend({outcome:'sent'});});
 // Both success and stale rejection must wait for a request started after the result.
 expect(optionButton().disabled).toBe(true);
 await act(async()=>{finishOld(approvalPane);}); expect(optionButton().disabled).toBe(true);
 await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
 await act(async()=>{finishNew(approvalPane);}); expect(optionButton().disabled).toBe(false);
});
