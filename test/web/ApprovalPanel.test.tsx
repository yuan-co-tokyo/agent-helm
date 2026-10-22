// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApprovalPanel } from '../../src/web/components/ApprovalPanel.js';
import { apiGet, apiPost, HelmApiError } from '../../src/web/api/client.js';
import type { OrchestratorScreenResponse } from '../../src/shared/api.js';
import { isUuid } from '../../src/shared/constants.js';
vi.mock('../../src/web/api/client.js',async importOriginal=>({...await importOriginal<object>(),apiGet:vi.fn(),apiPost:vi.fn()}));
const pane:OrchestratorScreenResponse = {text:'<script>untrusted</script>\nconfirm output',capturedAt:'2026-10-21T10:00:00Z',lines:2,source:'tmux',inputReady:{ok:false},approval:{agentKind:'codex',kind:'approval',detail:'',question:'Allow?',fingerprint:'original',capturedAt:'2026-10-21T10:00:00Z',options:[{key:'1',label:'Yes',meaning:'approve',shortcut:null,warn:false,sendable:true},{key:'2',label:'No',meaning:'deny',shortcut:null,warn:false,sendable:true},{key:'3',label:'Always',meaning:'approve_always',shortcut:null,warn:true,sendable:true},{key:'4',label:'Other',meaning:'unknown',shortcut:null,warn:false,sendable:true}]}};
beforeEach(()=> { vi.mocked(apiGet).mockResolvedValue(pane); vi.mocked(apiPost).mockResolvedValue({outcome:'sent',requestId:'x',after:{...pane,text:'after output'}}); });
afterEach(()=> { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function setup() { render(<ApprovalPanel target={{kind:'orchestrator'}} projectName="Project" />); await screen.findByText('Allow?'); }
function openDialog() { fireEvent.click(screen.getByRole('button',{name:'[1] Yes 承認'})); return within(screen.getByRole('dialog')); }
test('labels meanings, renders text safely and focuses cancel',async()=> {
 await setup(); expect(screen.getByRole('button',{name:'[2] No 拒否'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'[3] Always ⚠ 以後確認しない'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'[4] Other'}).children).toHaveLength(0);
 expect(document.querySelector('script')).toBeNull();
 const dialog = openDialog(); expect(dialog.getByText(/Project.*Orchestrator.*codex/)).toBeTruthy();
 expect(document.activeElement).toBe(dialog.getByRole('button',{name:'キャンセル'}));
 fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'}); expect(screen.queryByRole('dialog')).toBeNull();
});
test('freezes confirmation and sends the captured fingerprint only once',async()=> {
 await setup(); vi.useFakeTimers(); const dialog = openDialog();
 vi.mocked(apiGet).mockResolvedValue({...pane,approval:{...pane.approval!,fingerprint:'changed'}});
 await act(async()=> { await vi.advanceTimersByTimeAsync(5000); }); expect(apiGet).toHaveBeenCalledTimes(1);
 vi.mocked(apiPost).mockReturnValue(new Promise(()=>{}));
 const button = dialog.getByRole('button',{name:'送信'}); fireEvent.click(button); fireEvent.click(button);
 expect(apiPost).toHaveBeenCalledTimes(1);
 const body = vi.mocked(apiPost).mock.calls[0]?.[1] as {requestId:string};
 expect(isUuid(body.requestId)).toBe(true);
 expect(apiPost).toHaveBeenCalledWith('/api/approvals/respond',expect.objectContaining({target:{kind:'orchestrator'},fingerprint:'original',key:'1'}));
 expect(screen.getAllByRole('button').every(button=>(button as HTMLButtonElement).disabled)).toBe(true);
});
test('shows after output without claiming approval completion',async()=> {
 await setup(); fireEvent.click(openDialog().getByRole('button',{name:'送信'}));
 await screen.findByText('after output'); expect(screen.queryByText(/承認完了/)).toBeNull();
});
test.each([[409,'stale','画面が変化しました。再確認してください'],[410,'gone','対象は終了しています']])('handles %s',async(status,code,message)=> {
 await setup(); vi.mocked(apiPost).mockRejectedValue(new HelmApiError(Number(status),String(code)));
 fireEvent.click(openDialog().getByRole('button',{name:'送信'})); await screen.findByText(String(message));
 if (status===409) await waitFor(()=>expect(apiGet).toHaveBeenCalledTimes(2));
 else expect(screen.queryByRole('button',{name:'[1] Yes 承認'})).toBeNull();
 expect(apiPost).toHaveBeenCalledTimes(1);
});
test('unknown freezes actions until successful explicit verification',async()=> {
 await setup(); vi.useFakeTimers(); vi.mocked(apiPost).mockRejectedValue(new HelmApiError(0,'network'));
 fireEvent.click(openDialog().getByRole('button',{name:'送信'})); await act(async()=>{});
 await act(async()=> { await vi.advanceTimersByTimeAsync(30000); });
 expect(apiPost).toHaveBeenCalledTimes(1); expect(apiGet).toHaveBeenCalledTimes(1);
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 vi.mocked(apiGet).mockRejectedValueOnce(new HelmApiError(0,'network'));
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(false);
});
test('validates task IDs and resets state on target changes',async()=> {
 const view = render(<ApprovalPanel target={{kind:'task',taskId:'invalid'}} />);
 await screen.findByText(/切断中/); expect(apiGet).not.toHaveBeenCalled();
 const id = 'e0c2e422-06b1-4c32-b0f2-5fdfbfbff09e';
 vi.mocked(apiGet).mockResolvedValue({title:'Task',agent:'codex',approval:null,pane});
 view.rerender(<ApprovalPanel target={{kind:'task',taskId:id}} />);
 await screen.findByText('承認待ちは検出されていません'); expect(apiGet).toHaveBeenCalledWith(`/api/tasks/${id}`);
});
test('failed manual check without a prior send does not report an unknown send',async()=> {
 await setup(); vi.mocked(apiGet).mockRejectedValueOnce(new HelmApiError(0,'network'));
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await screen.findByText('最新の画面を取得できませんでした');
 expect(screen.queryByText(/結果不明/)).toBeNull();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(false);
});
