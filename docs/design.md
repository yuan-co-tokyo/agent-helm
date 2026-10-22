# agent-helm MVP 設計

前提：`docs/research.md`（agtx 1.0.6 調査記録）。依頼書：`docs/agent-helm-development-prompt.md`。

## 1. 技術選定

| 領域 | 選定 | 理由 |
|---|---|---|
| 言語 | TypeScript（strict）、Node.js 22+ | フロント・BFF で型を共有できる |
| BFF | **Hono + @hono/node-server** | 軽量、ミドルウェアで Host/Origin/CSRF を書きやすい。Next.js より実装量が小さく、tmux 子プロセスとの相性が良い |
| UI | **Vite + React 18** | SPA を BFF が同一オリジンで配信。SSR 不要 |
| テスト | Vitest（単体・契約）、Playwright（PC / モバイル幅 E2E） | |
| Lint | ESLint + `tsc --noEmit` | |
| パッケージ | pnpm、単一パッケージ（`src/server`, `src/web`, `src/shared`） | モノレポ化は不要 |

ディレクトリ：

```
src/shared/      API 契約型（api.ts）、状態分類の列挙
src/server/      BFF：index.ts, config.ts, security.ts, routes/*
  agtx/          AgtxGateway（interface + HttpAgtxGateway + MockAgtxGateway）
  orchestrator/  OrchestratorAdapter（interface + TmuxOrchestratorAdapter）
  tmux/          execFile ラッパ（引数分離、シェル不使用）
  approval/      検出器・フィンガープリント・送信ガード
  status/        タスク正規化・PR 取得
src/web/         React UI
test/            fixtures（実ペインのサンプル）、モック agtx サーバー
```

## 2. 全体構成

```
Browser ──(same origin, 127.0.0.1:8790)── BFF(Hono)
                                           ├─ AgtxGateway ── HTTP ── agtx serve (127.0.0.1:8787)
                                           ├─ OrchestratorAdapter ── tmux -L agtx (execFile)
                                           └─ gh（PR 状態の読み取りのみ、任意）
```

- 状態の正本は agtx。BFF は**インメモリ**のみ（送信記録・冪等キー・最終取得時刻）。DB は作らない。
- 遷移 API（action）・タスク CRUD・マージは呼ばない。

## 3. 設定（`agent-helm.config.json` または環境変数）

```jsonc
{
  "listen": { "host": "127.0.0.1", "port": 8790 },          // 127.0.0.1 / ::1 以外は起動拒否（将来は明示フラグ＋認証必須）
  "agtx": { "baseUrl": "http://127.0.0.1:8787", "projectName": "agent-helm", "timeoutMs": 5000 },
  "orchestrator": { "tmuxSocket": "agtx", "session": "agent-helm", "window": "orchestrator" },
  "limits": { "instructionMaxChars": 8000 }
}
```

- `agtx.baseUrl` は loopback のみ許可。プロジェクトは名前で指定し、起動時と定期的に `/api/projects` で UUID に解決（一致 0 件・複数件はエラー表示）。
- tmux 対象（ソケット・セッション・ウィンドウ）は設定値のみ。**ウィンドウ内のペインがちょうど 1 つ**であることを毎回検証し、0 または複数なら送信しない。

## 4. AgtxGateway

```ts
interface AgtxGateway {
  getHealth(): Promise<AgtxHealth>;                 // version, tuiConnected, fetchedAt
  resolveProject(): Promise<ProjectRef>;            // name → UUID
  listTasks(): Promise<TaskSummary[]>;
  getTask(taskId: string): Promise<TaskDetail>;
  readPane(taskId: string, lines?: number): Promise<PaneSnapshot>;
  sendKey(taskId: string, key: AgtxKey): Promise<KeySendResult>;   // agtx の閉じたキー集合のみ
}
```

- `HttpAgtxGateway` が HTTP 差異・タイムアウト・エラー正規化を閉じ込める。エラーは `GatewayError{kind: 'unreachable'|'timeout'|'not_found'|'conflict'|'bad_response'|'unknown'|'project_not_found'|'project_ambiguous'}`。
- プロジェクト名の一致が 0 件なら `project_not_found`、複数なら `project_ambiguous`。正常に解決した UUID のみを URL に使う。
- `/pane` 成功形式は実機で未確認のため、文字列／`{content}`／`{text}`／`{lines:string[]}`／`{output}` を受け付け、ANSI と制御文字を除去した `PaneSnapshot` に正規化する。それ以外は `bad_response`。
- Gateway/Adapter の送信結果には `requestId` を含めず、ルート層で付与する。
- **タスクへの自由テキスト送信は提供しない**（agtx の `{text}` は Enter ループを行うため）。
- `sendKey` のタイムアウト・接続断は `outcome: 'unknown'` を返し、**自動再試行しない**。
- 対応バージョン：1.0.6。起動時に `/api/health.version` を確認し、不一致は警告表示（動作は継続）。契約テストは `test/contract/` で実 agtx に対して任意実行（`AGTX_CONTRACT=1`）。

## 5. OrchestratorAdapter

```ts
interface OrchestratorAdapter {
  describeTarget(): OrchestratorTarget;              // socket/session/window（表示用）
  getStatus(): Promise<OrchestratorStatus>;          // 'running'|'not_found'|'ambiguous'|'error' + paneId, currentCommand
  readScreen(lines?: number): Promise<PaneSnapshot>;
  sendInstruction(text: string): Promise<Omit<SendResult, 'requestId'>>;
  sendKey(key: OrchestratorKey): Promise<Omit<SendResult, 'requestId'>>;
}
```

`TmuxOrchestratorAdapter`：

- すべて `execFile('tmux', ['-L', socket, ...args])`。シェル文字列連結は禁止。
- 対象解決：`list-panes -t <session>:<window> -F '#{pane_id} #{pane_dead} #{pane_current_command}'`。ペイン 1 つでなければ `ambiguous` / `not_found`。以後の操作はペイン ID（`%NN`）で行い、各操作直前に再解決して一致を確認。
- 画面取得：`capture-pane -p -J -t %NN -S -<lines>`（ANSI なし）。
- 指示送信（同一ペインはミューテックスで直列化）：
  1. 画面を取得し、**入力可能状態**か判定（承認画面・選択メニュー・補完候補・入力欄が空でない → 拒否して理由を返す）。
  2. `load-buffer -b agent-helm-<uuid> -`（stdin で本文を渡す）→ `paste-buffer -p -d -b ... -t %NN`（bracketed paste なので改行で送信されない）。
  3. `send-keys -t %NN Enter` を **1 回だけ**。
  4. 画面を再取得して返す。結果は `sent`（ペインへの送信成功）であり「受理」「完了」ではないと UI で明示。
- 文字数上限（既定 8000）超過は 413 で拒否。黙って切り詰めない。NUL・制御文字（\t \n 以外）は拒否。
- 許可キー：`y n a 1 2 3 4 Enter Escape Up Down`（`C-c` 等は提供しない）。

## 6. 承認（Approval）

対象 `ApprovalTarget = {kind:'task', taskId} | {kind:'orchestrator'}`。

1. **検出**：ペインの末尾 40 行に検出器を適用。
   - `claude`：`Do you want to …?` 等＋`❯ 1. Yes` 形式の番号付き選択肢
   - `codex`：`Would you like to …` / `Allow …` 等＋`› 1. Yes, proceed (y)` 形式。括弧内ショートカットも抽出
   - `generic`：`[y/N]` `(yes/no)` 等
   - 抽出結果 `ApprovalPrompt{agentKind, question, options:[{key, label, meaning:'approve'|'approve_always'|'deny'|'unknown'}], fingerprint, capturedAt}`。
   - `meaning` はラベル文言から判定し、判定できなければ `unknown`（UI はキーとラベルをそのまま表示）。`approve_always`（以後確認しない）は UI で警告表示し既定選択にしない。
   - 検出不能でも `phase_status=blocked` / `agent_state=blocked` なら「要対応（理由不明）」として画面を表示。blocked を承認待ちと決めつけない。
2. **フィンガープリント**：検出領域（質問〜選択肢）の正規化テキストの SHA-256。
3. **送信** `POST /api/approvals/respond {target, fingerprint, key, requestId}`：
   - `requestId`（UI 生成 UUID）が既知 → 前回結果をそのまま返し再送しない。
   - 対象を再取得：タスクが存在しない／Planning・Running・Review 以外／セッションなし → 410。
   - 画面を再取得し再検出。フィンガープリント不一致・承認画面消失 → 409 `stale`（送信しない）。
   - `key` が検出結果の選択肢に含まれない → 400。
   - 送信。タイムアウト等 → `outcome:'unknown'`（自動再試行なし）。
   - 送信後 1 秒待って画面再取得し、`after` として返す。「承認完了」とは表示しない。
4. 確認〜送信の間の外部入力による競合は tmux では完全に防げない（制約として README に明記）。

## 7. タスク状態の正規化

`TaskView.displayState`：

| displayState | 条件（上から優先） |
|---|---|
| `disconnected` | agtx 到達不能（最終成功値をキャッシュ表示、取得時刻付き） |
| `stale` | `tui_connected=false` または `phase_age_secs > 30` |
| `approval` | ペイン検出器が承認画面を検出 |
| `blocked` | `phase_status=blocked` または `agent_state=blocked`（理由不明） |
| `error` | `phase_status=exited` かつ status が planning/running |
| `reviewing` | status=review かつ working |
| `phase_done` | `phase_status=ready` |
| `running` | `phase_status=working` |
| `idle` | `phase_status=idle` |
| `unknown` | その他（phase_status=null 等） |

承認検出のためのペイン読み取りは、`phase_status ∈ {blocked, idle}` かつ セッションありのタスクに限定（負荷抑制）。

PR：`pr_url`/`pr_number` を表示。`gh pr view <url> --json state,isDraft,reviewDecision,mergedAt` を execFile で取得（60 秒キャッシュ）。取得不能は `unknown`。表示区分：`none`（PRなし）/`open_review_pending`/`approved_waiting_merge`（手動マージ待ち）/`merged`/`closed`/`unknown`。マージ操作は実装しない。
テスト結果：構造化データはないため、タスク詳細でペイン出力（出典）を示し、`未取得` と表示。成功とは表示しない。

## 8. BFF API（UI との契約、`src/shared/api.ts`）

| メソッド | パス | 応答 |
|---|---|---|
| GET | `/api/session` | `{csrfToken, target:{project, orchestrator}, versions}` |
| GET | `/api/state` | `{fetchedAt, agtx:{reachable, version, tuiConnected, error?}, orchestrator:OrchestratorStatus, tasks:TaskView[], attention:AttentionItem[]}` |
| GET | `/api/tasks/:id` | `TaskDetailView`（description, pane, approval?, pr） |
| GET | `/api/orchestrator/screen?lines=` | `PaneSnapshot & {approval?, inputReady:{ok, reason?}}` |
| POST | `/api/orchestrator/instructions` | `{text, requestId}` → `SendResult` |
| POST | `/api/approvals/respond` | 上記 |

`SendResult = {requestId, outcome:'sent'|'rejected'|'unknown', reason?, after?:PaneSnapshot}`。
エラーは `{error:{code, message}}`。

## 9. 更新方式

- ブラウザ → BFF：**ポーリング**（`/api/state` 3 秒、表示中のペイン 1.5 秒）。タブ非表示時は停止、復帰時に即時取得。失敗時は指数バックオフ（最大 15 秒）し「切断中・最終取得 hh:mm:ss」を表示。
- 理由：SSE/WS より実装・再接続が単純。agtx の WS は差分フレームのみで、承認検出には全画面が必要なため BFF からは HTTP `/pane` と tmux capture を使う。
- 取得失敗時は前回値を「古い」表示で残し、**空一覧や完了として扱わない**。

## 10. セキュリティ

- 待受は loopback のみ（設定で他を指定すると起動失敗）。
- `Host` ヘッダが `127.0.0.1:<port>` / `localhost:<port>` / `[::1]:<port>` 以外は 421。
- 変更系（POST）は `Origin` が自オリジンと一致必須、かつ `X-Helm-CSRF` ヘッダ＝起動時ランダムトークン（`/api/session` で配布）。`Content-Type: application/json` 必須。
- 汎用プロキシにしない：BFF のルートは固定。タスク ID は UUID 形式を検証し、agtx の一覧に存在するもののみ受け付ける。
- ペイン・タスク名は React のテキストとして描画（`dangerouslySetInnerHTML` 禁止）。ANSI は除去。
- ログに指示本文・ペイン内容を出さない（長さとハッシュのみ）。
- CSP：`default-src 'self'`、`frame-ancestors 'none'`。

## 11. 画面

1 画面構成（PC は 2 カラム、スマホ 768px 未満は縦積み＋下部タブ）：

1. **ヘッダ**：プロジェクト、agtx/TUI/Orchestrator の接続状態、最終取得時刻
2. **要対応**（最上部、色付き）：承認待ち候補・blocked・エラー・切断。各項目から承認パネルへ
3. **Orchestrator コンソール**：画面出力（等幅、自動スクロール）＋入力欄（複数行、Ctrl/⌘+Enter 送信、文字数カウンタ）＋送信状態（送信中／送信済み＝ペインに入力されました／失敗／結果不明）
4. **タスク一覧**：タイトル、フェーズ、エージェント、表示状態、依存、PR
5. **タスク詳細**（ドロワー／スマホは全画面）：説明、ペイン出力、PR、承認パネル
6. **承認パネル**：対象（プロジェクト・タスク・エージェント）、取得時刻、画面抜粋、選択肢ボタン（`[1] Yes` のようにキーとラベルを併記）。押下で確認ダイアログ→送信。送信中はボタン無効化。

## 12. テスト方針

- 単体：検出器（実画面フィクスチャ）、状態分類、入力検証、セキュリティミドルウェア、冪等性。
- Adapter 契約：`OrchestratorAdapter` / `AgtxGateway` に共通契約テストを用意し、モック・実装の双方に適用。
- 統合：モック agtx サーバー＋tmux の検証用ソケット（`-L agent-helm-test`）で TmuxOrchestratorAdapter を実テスト。**本番の `agtx` ソケットにはテストで触れない。**
- E2E：Playwright で 1280px / 390px。
- 実機：統合検証タスクで実 agtx・実 Claude/Codex 承認を確認し `docs/verification.md` に記録。

## 13. スコープ外・将来

Agent SDK 方式（B案）、構造化会話履歴、Web Push、リモート公開（Tailscale 等＋HTTPS＋認証）、複数ユーザー、タスク編集。
