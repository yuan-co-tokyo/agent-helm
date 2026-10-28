// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ApprovalPanel } from '../../src/web/components/ApprovalPanel.js';
import { apiGet, apiPost, HelmApiError } from '../../src/web/api/client.js';
import type { OrchestratorScreenResponse, TaskDetailView } from '../../src/shared/api.js';
import { mockTasks } from '../../src/web/api/mock.js';
import { isUuid } from '../../src/shared/constants.js';
vi.mock('../../src/web/api/client.js',async importOriginal=>({...await importOriginal<object>(),apiGet:vi.fn(),apiPost:vi.fn()}));
const pane:OrchestratorScreenResponse = {text:'<script>untrusted</script>\nconfirm output',capturedAt:'2026-10-21T10:00:00Z',lines:2,source:'tmux',inputReady:{ok:false},approval:{confirm:'key',agentKind:'codex',kind:'approval',detail:'',question:'Allow?',fingerprint:'original',capturedAt:'2026-10-21T10:00:00Z',options:[{key:'1',label:'Yes',meaning:'approve',shortcut:null,warn:false,sendable:true},{key:'2',label:'No',meaning:'deny',shortcut:null,warn:false,sendable:true},{key:'3',label:'Always',meaning:'approve_always',shortcut:null,warn:true,sendable:true},{key:'4',label:'Other',meaning:'unknown',shortcut:null,warn:false,sendable:true}]}};
beforeEach(()=> { vi.mocked(apiGet).mockResolvedValue(pane); vi.mocked(apiPost).mockResolvedValue({outcome:'sent',requestId:'x',after:{...pane,text:'after output'}}); });
afterEach(()=> { cleanup(); vi.resetAllMocks(); vi.useRealTimers(); });
async function setup() { render(<ApprovalPanel project={{id:"11111111-1111-4111-8111-111111111111",name:"Project"}} target={{kind:'orchestrator'}} />); await screen.findByText('Allow?'); }
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
 expect(apiPost).toHaveBeenCalledWith('/api/projects/11111111-1111-4111-8111-111111111111/approvals/respond',expect.objectContaining({target:{kind:'orchestrator'},fingerprint:'original',key:'1'}));
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
 const view = render(<ApprovalPanel project={{id:"11111111-1111-4111-8111-111111111111",name:"Project"}} target={{kind:'task',taskId:'invalid'}} />);
 await screen.findByText(/切断中/); expect(apiGet).not.toHaveBeenCalled();
 const id = 'e0c2e422-06b1-4c32-b0f2-5fdfbfbff09e';
 vi.mocked(apiGet).mockResolvedValue({title:'Task',agent:'codex',approval:null,pane});
 view.rerender(<ApprovalPanel project={{id:"11111111-1111-4111-8111-111111111111",name:"Project"}} target={{kind:'task',taskId:id}} />);
 await screen.findByText('承認待ちは検出されていません'); expect(apiGet).toHaveBeenCalledWith(`/api/projects/11111111-1111-4111-8111-111111111111/tasks/${id}`);
});
test('failed manual check without a prior send does not report an unknown send',async()=> {
 await setup(); vi.mocked(apiGet).mockRejectedValueOnce(new HelmApiError(0,'network'));
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await screen.findByText('最新の画面を取得できませんでした');
 expect(screen.queryByText(/結果不明/)).toBeNull();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(false);
});

test('shows terminal guidance without option buttons',async()=> {
 vi.mocked(apiGet).mockResolvedValue({...pane,approval:{...pane.approval!,terminalOnly:true,options:[],detail:'Folder path'}});
 await setup(); expect(screen.getByText('この確認は端末（agtx TUI）で操作してください')).toBeTruthy();
 expect(screen.getByText('Folder path')).toBeTruthy(); expect(screen.queryAllByRole('button',{name:/^\[/})).toHaveLength(0);
});
test('formats capture times in the panel and confirmation',async()=> {
 await setup(); const {formatTime} = await import('../../src/web/lib/send-state.js');
 expect(screen.getByText('取得時刻: '+formatTime(pane.capturedAt))).toBeTruthy();
 const dialog = openDialog(); expect(dialog.getByText('取得時刻: '+formatTime(pane.capturedAt))).toBeTruthy();
 expect(screen.queryByText('取得時刻: '+pane.capturedAt)).toBeNull();
});
test('explains trust Enter confirmation and holds unconfirmed actions until refresh',async()=> {
 vi.mocked(apiGet).mockResolvedValue({...pane,approval:{...pane.approval!,confirm:'enter'}});
 vi.mocked(apiPost).mockResolvedValue({outcome:'sent_unconfirmed',requestId:'x',after:{...pane,text:'unchanged output'}});
 await setup(); expect(screen.getByText('数字で選択後、カーソル確認のうえ Enter を送ります')).toBeTruthy();
 const dialog = openDialog(); expect(dialog.getByText(/押すキー: \[1\] → Enter/)).toBeTruthy();
 vi.mocked(apiGet).mockReturnValue(new Promise(()=>{}));
 fireEvent.click(dialog.getByRole('button',{name:'送信'}));
 await screen.findByText('キーは届きましたが画面が変わっていません。端末で確認してください');
 expect(screen.getByText('unchanged output')).toBeTruthy();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 expect(apiPost).toHaveBeenCalledTimes(1);
});

function sharedTask() {
 const data:TaskDetailView = {...mockTasks[0]!,title:'Shared task',agent:'codex',approval:pane.approval,pane};
 const polling = {data,error:null as unknown,lastSuccessAt:pane.capturedAt,revision:1,seq:1,startedSeq:()=>2,stale:false,refresh:vi.fn()};
 const target = {kind:'task' as const,taskId:'e0c2e422-06b1-4c32-b0f2-5fdfbfbff09e'};
 const view = render(<ApprovalPanel project={{id:"11111111-1111-4111-8111-111111111111",name:"Project"}} target={target} screen={polling} />);
 return {polling,data,update:()=>view.rerender(<ApprovalPanel project={{id:"11111111-1111-4111-8111-111111111111",name:"Project"}} target={target} screen={{...polling}} />)};
}
test('shared task freezes the question and fingerprint, and waits for a poll started after send',async()=> {
 const {polling,data,update} = sharedTask();
 const dialog = openDialog();
 polling.data = {...data,approval:{...pane.approval!,question:'Changed?',fingerprint:'changed'}};
 polling.revision++; polling.seq=2; update();
 expect(dialog.getByText('Allow?')).toBeTruthy();
 expect(dialog.queryByText('Changed?')).toBeNull();
 vi.mocked(apiPost).mockResolvedValue({outcome:'sent_unconfirmed',requestId:'x',after:pane});
 fireEvent.click(dialog.getByRole('button',{name:'送信'})); await act(async()=>{});
 expect(apiPost).toHaveBeenCalledWith('/api/projects/11111111-1111-4111-8111-111111111111/approvals/respond',expect.objectContaining({fingerprint:'original'}));
 expect(screen.getByText('キーは届きましたが画面が変わっていません。端末で確認してください')).toBeTruthy();
 expect(polling.refresh).toHaveBeenCalledOnce();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 polling.revision++; update();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 polling.seq=3; polling.revision++; update();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(false);
 expect(apiGet).not.toHaveBeenCalled();
});
test('shared task unknown remains locked across polls until manual verification succeeds',async()=> {
 const {polling,data,update} = sharedTask();
 vi.mocked(apiPost).mockRejectedValue(new HelmApiError(0,'network'));
 fireEvent.click(openDialog().getByRole('button',{name:'送信'})); await act(async()=>{});
 polling.seq=3; polling.revision++; update();
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 vi.mocked(apiGet).mockRejectedValueOnce(new HelmApiError(0,'network'));
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(true);
 vi.mocked(apiGet).mockResolvedValue(data);
 fireEvent.click(screen.getByRole('button',{name:'最新を確認'})); await act(async()=>{});
 expect((screen.getByRole('button',{name:'[1] Yes 承認'}) as HTMLButtonElement).disabled).toBe(false);
});
test.each([404,410])('shared task handles a gone poll: %s',status=> {
 const {polling,update} = sharedTask();
 polling.error = new HelmApiError(status,'gone'); polling.stale=true; update();
 expect(screen.getByText('対象は終了しています')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'[1] Yes 承認'})).toBeNull();
 expect(apiGet).not.toHaveBeenCalled();
});

test('closes confirmation when project changes and includes the captured project ID in sends', async () => {
 const a = { id: '11111111-1111-4111-8111-111111111111', name: 'Project A' };
 const b = { id: '33333333-3333-4333-8333-333333333333', name: 'Project B' };
 const view = render(<ApprovalPanel project={a} target={{ kind: 'orchestrator' }} />);
 await screen.findByText('Allow?'); openDialog();
 expect(screen.getByRole('dialog').textContent).toContain('送信先プロジェクト: Project A');
 view.rerender(<ApprovalPanel project={b} target={{ kind: 'orchestrator' }} />);
 expect(screen.queryByRole('dialog')).toBeNull(); expect(apiPost).not.toHaveBeenCalled();
 await screen.findByText('Allow?');
 fireEvent.click(openDialog().getByRole('button', { name: '送信' }));
 expect(apiPost).toHaveBeenCalledWith(`/api/projects/${b.id}/approvals/respond`,expect.objectContaining({ projectId: b.id }));
});
