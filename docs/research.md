# agtx 環境調査記録

調査日：2026-10-21 / 調査者：Orchestrator（Claude Code）
凡例：**確認済** = 対象環境で実際に確認 / **推定** = バイナリ・同梱JSの読解による / **未確認** = 実機での確認が必要

## 1. バージョン

| 対象 | バージョン | 状態 |
|---|---|---|
| agtx | 1.0.6（`/api/health` の `version` も 1.0.6） | 確認済 |
| Claude Code | 2.1.306 | 確認済 |
| Codex CLI | 0.156.1 | 確認済 |
| tmux | 3.7b | 確認済 |
| Node.js | v26.5.0（pnpm / npm 利用可） | 確認済 |
| gh | ログイン済（`yuan-co-tokyo`, ssh） | 確認済 |

## 2. agtx の構成

- TUI は `agtx --experimental` で起動中。tmux は **専用ソケット `-L agtx`**（`/private/tmp/tmux-501/agtx`）を使う。 — 確認済
- tmux セッションはプロジェクト名（`agent-helm`, `agtx-playground`）。Orchestrator は **`orchestrator` という名前のウィンドウ**で動く。ウィンドウ番号はプロジェクトごとに異なる（agent-helm は `:1`、agtx-playground は `:3`）。番号をハードコードできない。 — 確認済
- Orchestrator ペインは `claude --dangerously-skip-permissions` で起動され、MCP `agtx mcp-serve <project path>` が登録される。**この環境の Orchestrator はパーミッションバイパス中のため、Orchestrator 自身の実行許可画面は通常は出ない。** — 確認済（AC-06 の検証に影響）
- 設定（`get_config`）：`auto_trust=false`、phase agents = research/planning/review: claude、running: codex、worktree 有効（`.agtx/worktrees`、prefix `task`）。 — 確認済

## 3. `agtx serve`（HTTP / WebSocket / PWA）

起動：`agtx serve [path] --host 127.0.0.1 --port <n>`（既定 127.0.0.1:8787）。path 指定でそのプロジェクトのみ。loopback 以外へのバインドはデバイスペアリング（Bearer トークン）必須。`--tunnel` で公開できるが**本プロジェクトでは使用禁止**。 — 確認済（`--help`）

### エンドポイント（同梱 `api.js` と実リクエストで確認）

| メソッド | パス | 内容 | 状態 |
|---|---|---|---|
| GET | `/api/health` | `{version, mode, project_count, tui_connected}` | 確認済 |
| GET | `/api/projects` | `[{id(UUID), name, path, last_opened, tui_connected}]` | 確認済 |
| GET | `/api/projects/{pid}/tasks` | タスク一覧（description なし） | 確認済 |
| GET | `/api/projects/{pid}/tasks/{tid}` | 詳細（+description, worktree_path, session_name, pr_url, base_branch, referenced_tasks, created_at, agent_state, blocked_reason） | 確認済 |
| GET | `/api/projects/{pid}/tasks/{tid}/pane?lines=N` | ペイン内容。セッションなしは 404 `{"error":"... has no active session"}` | 404 のみ確認済。成功時の形式は**未確認** |
| GET | `/api/projects/{pid}/tasks/{tid}/diff` | diff | 推定 |
| POST | `/api/projects/{pid}/tasks/{tid}/action` | `{action, reason}` 遷移を**キュー投入**（TUI が実行） | 推定 |
| GET | `/api/projects/{pid}/requests/{rid}` | キュー投入した遷移の状態 | 推定 |
| POST | `/api/projects/{pid}/tasks/{tid}/input` | `{key}` または `{text}`。done タスクには 409 | 409 のみ確認済 |
| POST/PATCH/DELETE | `/api/projects/{pid}/tasks[/{tid}]` | Backlog タスクの作成・編集・削除 | 推定（本アプリでは使わない） |
| WS | `/ws` | `{"type":"subscribe",project_id,task_id}` → `frame`（差分のみ送信、アイドル時は無送信）/`gone`/`error` | 推定 |

タスク一覧の主なフィールド：`id, title, status(backlog|planning|running|review|done), agent, plugin, cycle, branch_name, pr_number, escalation_note, updated_at, deps_satisfied, allowed_actions, phase_status(working|blocked|idle|ready|exited|null), phase_age_secs, conflicted, conflicting_files`。 — 確認済（agtx-playground の実データ）

### 重要な挙動

- **`{key}` 入力は閉じた集合**：`y n 1 2 3 Enter Escape Up Down C-c`（`PaneKey::parse` と対応、と同梱JSに記載）。それ以外のキーは送れない。 — 推定（同梱JSのコメント）
- **`{text}` 入力は「ペースト＋ピッカー回避の Enter ループ」**を行う（同梱JSコメント）。これは依頼書の「Enter の無制限な連打で回避しない」に抵触し得るため、**本アプリはタスクへの自由テキスト送信を MVP では提供しない**（承認はキー入力のみ）。 — 推定
- `phase_age_secs > 30` を同梱PWAは「古い（TUI不在）」と判定。TUI が約2秒ごとに `task_runtime` を更新する。 — 推定
- action はキュー投入のみ。TUI 不在では受理されても実行されない。 — 確認済（`--help`）
- **`move_to_done` / `move_to_done_and_merge` はマージ・cleanup を伴い得る**（MCP の説明に `move_to_done_and_merge` はマージと明記、`auto_cleanup=true`）。本アプリは**遷移 API を一切呼ばない**。 — 確認済（MCP説明）
- **agtx serve は loopback で Origin を検証しない**：`Origin: http://evil.example` 付き POST が処理まで到達した（状態起因の 409 が返った）。JSON の Content-Type によりブラウザからはプリフライトで止まるが、BFF の安全性を agtx に依存しない。 — 確認済
- CORS ヘッダは返さない（同一オリジン前提）。 — 確認済
- プロジェクト ID は `/api/projects` の UUID を使う。MCP 側の `project_id` 表現と同一視しない。 — 確認済（一覧は UUID）

## 4. MCP（`agtx mcp-serve <path>`）

`list_tasks`（`tui_connected` を含む）、`get_task`（`allowed_actions`, `agent_state`, `blocked_reason`）、`wait_for_board_change`（長時間待機で差分のみ返す）、`read_pane_content`、`send_to_task`（最大 4096 bytes、Enter 付き）、`create_tasks_batch` 等。stdio 専用で、BFF から使うには子プロセス管理が必要。 — 確認済（ツール定義）

## 5. 承認画面（実行許可）

| エージェント | 想定表示 | 状態 |
|---|---|---|
| Claude Code 2.1.x | `Do you want to proceed?` / `❯ 1. Yes` / `2. Yes, and don't ask again ...` / `3. No, and tell Claude what to do differently (esc)` の番号付きメニュー | 推定（実画面は統合検証で取得する） |
| Codex 0.156 | `Would you like to run the following command?` / `› 1. Yes, proceed (y)` / `2. ...don't ask again... (a)` / `3. No, and tell Codex what to do differently (esc)` 等 | 推定（同上） |
| Orchestrator | Claude Code と同形式。ただし本環境はバイパス中 | 推定 |
| 信頼確認（auto_trust=false） | ワークツリー初回起動時の trust ダイアログ | 未確認 |

構造化された承認情報（選択肢・対象コマンド）を返す API は**見つからなかった**。`agent_state=blocked` と `blocked_reason` はあるが、選択肢のキー対応は含まない。→ MVP は「最新ペイン表示＋検出器による選択肢抽出＋明示キー入力」。 — 確認済（API）／推定（画面）

## 6. 内蔵 PWA の再利用評価

再利用できる：ボード表示、タスク詳細、diff、ライブペイン（WS）、キーチップ、遷移ボタン。
不足：Orchestrator への指示送信（Orchestrator はタスクではないため API 対象外）、承認画面の検出・選択肢の意味づけ、送信前の画面再確認（フィンガープリント照合）、二重送信防止、PR 状態の取得、TUI/Orchestrator 停止の統合表示、日本語 UI。
→ agent-helm は agtx serve を **BFF 経由のデータソース**として使い、UI は新規に作る。

## 7. 未確認事項（統合検証タスクで確認）

1. `/pane` 成功時のレスポンス形式（ANSI を含むか）
2. Claude / Codex の実際の承認画面と、`1/2/3/y/n/Enter/Escape` の効き方
3. trust ダイアログの表示形式
4. Running→Review 遷移時の PR 自動作成の有無
5. Orchestrator ペインへ bracketed paste で日本語・改行を送ったときの挙動

## 8. T6 実機再確認（2026-10-22）

- agtx **1.0.6** / Claude Code **2.1.307** / Codex CLI **0.156.1** / tmux **3.7b** / Node **26.5.0** / pnpm **10.19.0** を実測。既存 serve は **127.0.0.1:8799**。前節の 2.1.306 は前日の調査値。
- `/pane` 成功は **`{session_name: string, lines: number, content: string}`**。7 active タスクで HTTP 200、1 ペインには ANSI が含まれた。Gateway は `content` を取り出し ANSI を除去する。4 節以前の「成功形式未確認」は解消。
- `/tasks/{id}` の `referenced_tasks` は **null またはカンマ区切り UUID 文字列**。7 件で確認。配列と仮定した初期スキーマは `bad_response` になったため、null→[]、文字列→trim/split、配列→維持で正規化した。
- T6 が実行中にもかかわらず一覧は **`phase_status=exited`**、詳細は **`agent_state=ended`**、ペインは取得可能だった。CLI の終了判定と実画面は一致しない場合がある。exited/null の active タスクのペイン走査を維持する。
- 一覧と詳細は別リクエストであり、同一時刻の原子的 snapshot ではない。今回の再確認で更新遅延の秒数までは測定していない。list のフェーズだけで完了判定せず、active な不明/終了表示は getTask・ペインと照合する。
- 実 `/input` 成功本文は引き続き**未確認**。本番への POST は行っていない。Gateway は現状、読み取りまで完了した 2xx を sent とする。再現手順と範囲は [検証記録](verification.md) 参照。

### 承認画面の実測

- Claude 2.1.307: `Bash command`、説明、`ls`、権限ルール説明の後に `Do you want to proceed?` と **1 Yes / 2 No**。既存の推定 3 選択肢とは異なる。質問より上のコマンドも指紋へ含める修正を行った。Web から 2 を送り、`Interrupted · What should Claude do instead?` を確認。
- Claude の通常 manual モードでも `ls` は確認なしで実行された。検証セッションの `permissions.ask=["Bash(*)"]` を追加すると確認画面が出た。グローバルの権限ルールは変更していない。
- Claude trust: 番号なしの `No, exit` / `Yes, I trust this folder`（初期選択は拒否）。従来の numbered detector は対応しない。Web から推測キーを送らず端末で確認する。
- Codex 0.156.1: `Would you like to run the following command?`、`Environment: local`、`Reason: ...`、`$ ls`、**1 Yes, proceed (y) / 2 Yes, and don't ask again ... (p) / 3 No, and tell Codex ... (esc)**。実画面を取得し Escape で拒否。
- Codex trust: `Folder access`、`Trust this folder?` の説明、1 Trust and continue / 2 Quit。実フィクスチャを保存。
- `Approaching rate limits / Switch to …?` はモデル切替メニューで、実行許可ではない。回帰テストで承認検出 null、入力拒否 `menu_open` を確認（この文面のフィクスチャは合成、今回実機でレート制限は発生させていない）。
- 既存調査で Orchestrator の permissions bypass を確認済み。planning/review の Claude も起動設定によって bypass になるため、通常の承認を必ず表示するとは限らない。今回これらの本番セッションには入力せず、専用 manual セッションで確認した。

### CLI の注意

この環境では `agtx --help` がヘルプではなく TUI を起動した（非 TTY では `Device not configured`）。作業ディレクトリをプロジェクトへ自動登録する副作用があった。T6 ワークツリーの登録を追加した状態で TUI を終了している。CLI 調査でもこの操作を読み取り専用とはみなさないこと。
