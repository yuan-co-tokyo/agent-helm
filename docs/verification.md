# T6 統合検証記録

検証日: 2026-10-22（JST）。T1〜T5 を T6 ブランチへ順に統合。main への直接コミット、PR マージ、外部公開は実施していない。

## 実行環境と結果

| 対象 | 実測 |
|---|---|
| OS / Node / pnpm | macOS arm64 / 26.5.0 / 10.19.0 |
| agtx | 1.0.6、既存 serve `127.0.0.1:8799` |
| Claude Code / Codex | 2.1.307 / 0.156.1 |
| tmux / Chromium | 3.7b / Playwright revision 1248 |
| 実タスク表示 | 実 agtx 7 タスク、T6 詳細・説明・ペインを Chromium で表示 |
| 実 Orchestrator 承認 | 専用 `agent-helm-verify:helm-verify:claude-approval` の Claude `ls` 許可を Web から拒否。送信 `sent`、実画面 `Interrupted · What should Claude do instead?`、承認消失を確認 |

自動テストの再現コマンド:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
AGTX_CONTRACT=1 AGTX_BASE_URL=http://127.0.0.1:8799 pnpm test test/contract
```

- 型チェック・lint・ビルド: 成功。
- Vitest: 38 ファイル・270 件成功。実 agtx 契約テストは通常 skip、上記 opt-in 実行は 1 件成功。
- Playwright: desktop/mobile 各 4 シナリオ、計 8 件成功。状態・要対応・詳細・切断表示、日本語と改行・リテラル文字列の実 tmux 入力、選択→確認→限定キー送信、二重クリック 1 回、stale 409 と未送信、横スクロールなしを確認。
- `approval-integration.test.ts`: exited/null の active タスク、末尾空行、共通指紋、Claude のコマンドだけ変わる stale と復帰後の送信を検証。
- `detect.test.ts` / `adapter.test.ts`: 実画面、否定優先、レート制限メニュー除外、対象ごとのキー集合を検証。

最初の実契約テストは `referenced_tasks` の null/文字列で失敗した。実測に合わせて配列へ正規化し、回帰テストを追加した。最初のブラウザ起動は revision 1248 不在で失敗したが、`pnpm exec playwright install chromium` 後に成功。sandbox 内の HTTP/tmux テストは OS 制限で失敗したため、許可を得て制限外で実行した。

## 受け入れ条件

「未検証」は残る実機条件を含む。モックだけで通った条件は達成にしていない。

| 条件 | 判定 | 根拠・残件 |
|---|---|---|
| AC-01 ローカル起動・接続 | 達成 | build 後の startServer を loopback 8794 で起動し、実 agtx 8799 接続・UI 表示を確認。通常起動コマンドは README に記載 |
| AC-02 日本語・改行を既存 Orchestrator へ送信 | 未検証 | 専用実 tmux の prompt-app に E2E で送信・出力確認。既存本番 Orchestrator への送信は実施していない |
| AC-03 状態更新・詳細 | 達成 | 実 7 タスクと T6 詳細を Chromium で確認、GET 契約テスト成功。exited/ended を完了扱いしない |
| AC-04 Claude 許可・拒否 | 未検証 | Claude 2.1.307 の実画面表示と Web 拒否は成功。実 agtx タスクへの許可/拒否往復・許可後の実行は未確認。番号なし trust は非対応 |
| AC-05 Codex 許可・拒否 | 未検証 | 実行許可・trust 画面取得、端末 Escape による拒否まで確認。Web→実 agtx タスクへの入力は未確認 |
| AC-06 Orchestrator 自身の承認 | 達成 | 専用 Claude を対象に、Web の対象・キー確認→`2` 送信→実画面中断を確認。本番 Orchestrator には送信していない |
| AC-07 stale・終了・二重クリック・不明 | 未検証 | ルート/UI テストと E2E は成功。実 agtx の不明応答・対象終了を伴う異常系は未検証 |
| AC-08 停止・切断 | 未検証 | モック 503 で切断表示、単体で TUI/Orchestrator 不在を確認。稼働中の本番 TUI/serve を停止する試験は行っていない |
| AC-09 PR・テスト結果 | 未検証 | PR 分類・リンク・未取得表示のテスト成功。実 PR の状態遷移・テスト結果取得は未確認（テスト結果は常に未取得） |
| AC-10 PC/スマホ幅 | 達成 | 実 Chromium の 1280×800 / 390×844 で指示・詳細・承認を検証。実スマートフォン端末は未確認 |
| AC-11 注入・対象外防止 | 達成 | 実 tmux のリテラル文字列入力・完全一致対象、HTTP セキュリティ境界値、UI エスケープのテスト成功 |
| AC-12 外部公開・既存環境破壊なし | 達成 | loopback のみ、main/PR マージなし、既存タスクへの入力なし。下記のプロジェクト登録副作用あり |
| AC-13 Adapter 経由 | 達成 | agtx は HttpAgtxGateway、Orchestrator は TmuxOrchestratorAdapter。内部 DB 直接書き換えなし |
| AC-14 統合一連の流れ | 未検証 | T1〜T5 統合 E2E 成功、実状態・専用 Claude の Web 拒否成功。実 agtx `/input` を含む全経路は未確認 |

## 実画面フィクスチャ

`test/fixtures/panes/` に以下を保存。無関係な履歴・ローカルパスは除去/置換し、画面の選択肢・コマンドは保持した。

- `claude-bash-approval.real.txt`: manual モード、検証セッションだけ `permissions.ask=["Bash(*)"]`、コマンド `ls`。2 選択肢（Yes/No）。コマンドは質問より上にある。指紋にこのブロックを含める回帰テストを追加。
- `claude-trust.real.txt`: 番号なし「No, exit / Yes, I trust this folder」。安定した単一キー対応がないため検出器は null、端末での操作が必要。
- `codex-exec-approval.real.txt`: `Environment: local`、Reason、`$ ls`、1/2/3 と y/p/esc。
- `codex-trust.real.txt`: `Folder access`、`Trust this folder?`、1 Trust and continue / 2 Quit。

既存 `.estimated` は別のレイアウトを検証する推定フィクスチャとして残す。`.real` を実測の根拠とし、推定ファイルを実測済みと誤記しない。

## 実測手順と残件

実画面は `.agtx/verification/scratch` の空リポジトリで取得した。専用 tmux ソケット `agent-helm-verify`、session `helm-verify` に、Claude を `--permission-mode manual --setting-sources '' --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools Bash --disable-slash-commands` で起動。`ls` は通常確認不要だったため、別セッションで `--settings '{"permissions":{"ask":["Bash(*)"]}}'` を付けた。信頼確認は作成した空ディレクトリだけを許可。Codex は `--no-daemon --no-alt-screen -s read-only -a on-request` で同じ検証ディレクトリを使い、承認を求める `ls` を依頼、取得後 Escape で拒否した。

実 BFF は agtx を 8799、Orchestrator を検証専用 Claude、listen を 8794 に設定し、build 済み startServer で起動。ブラウザでタスク詳細を閲覧した後、検証専用の承認パネルで No を選び、確認ダイアログから送信した。BFF/ブラウザは終了時に close。検証専用 tmux も終了する。既定 `agtx` ソケットの kill/send-keys は実施していない。

実 `/input` の 2xx 本文は未検証。agtx 1.0.6 の CLI 手順を調べる際、`agtx --help` が通常 TUI を起動し、T6 ワークツリーを第 3 プロジェクトとして自動登録した。起動した TUI は `q` で終了。既存 `agent-helm` / `agtx-playground` のタスクは変更していない。新規登録を消すための DB 直接編集や不明な cleanup 操作は行っていない。隔離タスクを安全に起動する手順を確立できなかったため、本番タスクへの入力で代用しなかった。

残る `/input` 検証は、利用者が管理する使い捨てリポジトリを agtx に登録し、検証用タスクとセッションだけを起動して実施する。GET `/api/projects` の UUID とタスクを照合し、対象が検証用であることを確認後、`POST /api/projects/{pid}/tasks/{tid}/input` に `{"key":"Escape"}` を 1 回だけ送り、HTTP ステータスと JSON 本文・実ペインを記録する。2xx 本文に失敗表現がある場合は `HttpAgtxGateway.sendKey` の分類と回帰テストを追加する。
