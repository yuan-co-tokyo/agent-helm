# 統合検証記録

## T8 実機検証（2026-10-22）

承認済み T8 計画に記録された実測を反映。使い捨て `agent-helm-verify`、agtx 1.0.6 / Codex 0.156.1 を使用し、検証環境は検証後削除した。日本語・改行の Orchestrator 入力、Web から Codex 実行許可の `3` 拒否・`1` 許可、serve 停止を確認。実 `/input` は HTTP 200 / `{"delivered":true}` を返した。これはキーを渡したことを示し、承認の受理は保証しない。

trust の数字は選択のみだったため、数字後の同一指紋とカーソル一致を確認して Enter を送る実装に変更。exec は数字だけで確定する。送信後に同じ承認が残る場合は「画面が変わっていません」と表示する。今回の修正後の二段階送信・確定判定は実画面フィクスチャとモックで検証し、実 agtx・本番 Orchestrator への再送信は行わない。

T8 修正の検証: `pnpm typecheck` / `pnpm lint` / `pnpm build` 成功。`pnpm test` は 38 ファイル・320 件成功、実 agtx 契約テスト 1 件 skip。その後に入力待ちフィクスチャ 5 件と理由ラベルを補完し、関連 2 ファイル・28 件、型チェック・lint・ビルドを再確認。`pnpm test:e2e` は desktop/mobile 計 8 件成功。HTTP・専用 tmux・Chromium は承認を得てサンドボックス外で実行。

## T6 の検証記録

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
| AC-02 日本語・改行を既存 Orchestrator へ送信 | 達成 | T8 実機検証で日本語・改行の入力を確認。専用実 tmux の E2E でも検証 |
| AC-03 状態更新・詳細 | 達成 | 実 7 タスクと T6 詳細を Chromium で確認、GET 契約テスト成功。exited/ended を完了扱いしない |
| AC-04 Claude 許可・拒否 | 未検証 | agtx は Claude を bypass で起動するため実 agtx タスクでは検証不可。専用 tmux の実画面と Web 拒否の確認が上限。番号なし trust は端末操作を案内 |
| AC-05 Codex 許可・拒否 | 達成 | T8 で Web から `3` 拒否・`1` 許可を確認。trust は数字＋Enter 確定へ修正（修正後はフィクスチャ＋モック検証） |
| AC-06 Orchestrator 自身の承認 | 達成 | 専用 Claude を対象に、Web の対象・キー確認→`2` 送信→実画面中断を確認。本番 Orchestrator には送信していない |
| AC-07 stale・終了・二重クリック・不明 | 未検証 | ルート/UI テストと E2E は成功。実 agtx の不明応答・対象終了を伴う異常系は未検証 |
| AC-08 停止・切断 | 達成 | T8 の serve 停止で到達不可を確認。前回の TUI 接続値を残す問題を修正し、不明表示を回帰テストで確認 |
| AC-09 PR・テスト結果 | 未検証 | PR 分類・リンクのテスト成功、実 PR 状態遷移は未確認。テスト結果は仕様制限として未取得表示 |
| AC-10 PC/スマホ幅 | 達成 | Chromium 1280×800 / 390×844 で検証。外部公開禁止のため実スマートフォン端末は対象外 |
| AC-11 注入・対象外防止 | 達成 | 実 tmux のリテラル文字列入力・完全一致対象、HTTP セキュリティ境界値、UI エスケープのテスト成功 |
| AC-12 外部公開・既存環境破壊なし | 達成 | loopback のみ、main/PR マージなし、既存タスクへの入力なし。下記のプロジェクト登録副作用あり |
| AC-13 Adapter 経由 | 達成 | agtx は HttpAgtxGateway、Orchestrator は TmuxOrchestratorAdapter。内部 DB 直接書き換えなし |
| AC-14 統合一連の流れ | 達成 | T8 実 agtx 入力と Codex 許可・拒否を確認。確定判定、trust、TUI 不明、入力待ち表示の修正を含む。修正後の経路は自動テストで検証し、実機での再検証は未実施 |

## 実画面フィクスチャ

`test/fixtures/panes/` に以下を保存。無関係な履歴・ローカルパスは除去/置換し、画面の選択肢・コマンドは保持した。

- `claude-bash-approval.real.txt`: manual モード、検証セッションだけ `permissions.ask=["Bash(*)"]`、コマンド `ls`。2 選択肢（Yes/No）。コマンドは質問より上にある。指紋にこのブロックを含める回帰テストを追加。
- `claude-trust.real.txt`: 番号なし「No, exit / Yes, I trust this folder」。検出して要対応と端末操作の案内を表示する。Web からのキー送信は拒否する。
- `codex-exec-approval.real.txt`: `Environment: local`、Reason、`$ ls`、1/2/3 と y/p/esc。
- `codex-trust.real.txt`: `Folder access`、`Trust this folder?`、1 Trust and continue / 2 Quit。

既存 `.estimated` は別のレイアウトを検証する推定フィクスチャとして残す。`.real` を実測の根拠とし、推定ファイルを実測済みと誤記しない。

## 実測手順と残件

実画面は `.agtx/verification/scratch` の空リポジトリで取得した。専用 tmux ソケット `agent-helm-verify`、session `helm-verify` に、Claude を `--permission-mode manual --setting-sources '' --strict-mcp-config --mcp-config '{"mcpServers":{}}' --tools Bash --disable-slash-commands` で起動。`ls` は通常確認不要だったため、別セッションで `--settings '{"permissions":{"ask":["Bash(*)"]}}'` を付けた。信頼確認は作成した空ディレクトリだけを許可。Codex は `--no-daemon --no-alt-screen -s read-only -a on-request` で同じ検証ディレクトリを使い、承認を求める `ls` を依頼、取得後 Escape で拒否した。

実 BFF は agtx を 8799、Orchestrator を検証専用 Claude、listen を 8794 に設定し、build 済み startServer で起動。ブラウザでタスク詳細を閲覧した後、検証専用の承認パネルで No を選び、確認ダイアログから送信した。BFF/ブラウザは終了時に close。検証専用 tmux も終了する。既定 `agtx` ソケットの kill/send-keys は実施していない。

T6 時点では実 `/input` の本文が未確認だったが、T8 の使い捨て環境で HTTP 200 / `{"delivered":true}` を確認して解消した。数字送信だけでは trust が確定しないため、送信後画面の再取得を結果判定に使う。`delivered:false` は未配送の明示として rejected、空本文・欠落・非 boolean・不正 JSON は unknown とし、自動再送しない（false の実応答はモック検証のみ）。

T6 で `agtx --help` が TUI を起動して検証ワークツリーを自動登録した副作用は過去記録として残す。既存タスクへの代用送信や DB 直接編集は行っていない。
