# Agent Helm

agtx のタスク状態・要対応・PR・ペインをブラウザで確認し、既存 Orchestrator へ指示、タスクと Orchestrator の承認画面へ限定キーを送るローカル Web UI です。Hono BFF が agtx HTTP API と tmux を仲介します。タスク作成・状態遷移・PR マージは提供しません。

## 前提と確認済み環境

- Node.js 22.12 以降（Vite の要件）。実機検証は Node 26.5.0。
- pnpm 10.19.0、agtx 1.0.6、tmux 3.7b。
- Claude Code 2.1.306 を前提に設計し、2.1.307 の実行許可画面で検証。Codex CLI 0.156.1 の実行許可・信頼画面を取得。
- PR の詳細表示には認証済み `gh` が必要です。取得失敗は「不明」と表示します。
- agtx TUI、`agtx serve`、既存 Orchestrator の tmux セッションが必要です。Agent Helm はセッションを作成しません。

実機で確認できた範囲と未検証項目は [検証記録](docs/verification.md)、API の実測は [調査記録](docs/research.md) を参照してください。

## セットアップ・起動

```sh
pnpm install
cp agent-helm.config.example.json agent-helm.config.json
```

設定のプロジェクト名と tmux 対象を実環境に合わせます。以下の `my-project` はダミー値です。

```json
{
  "listen": { "host": "127.0.0.1", "port": 8790 },
  "agtx": { "baseUrl": "http://127.0.0.1:8787", "projectName": "my-project", "timeoutMs": 5000 },
  "orchestrator": { "tmuxSocket": "agtx", "session": "my-project", "window": "orchestrator" },
  "limits": { "instructionMaxChars": 8000 }
}
```

1. 対象リポジトリで agtx TUI を起動し、対象プロジェクトと Orchestrator を確認します。
2. 別端末で `agtx serve /path/to/my-project --host 127.0.0.1 --port 8787` を起動します。既に起動していれば再起動は不要です。今回の実環境は **8799** だったため、`agtx.baseUrl` も `http://127.0.0.1:8799` にしました。
3. Agent Helm のディレクトリで次を実行し、http://127.0.0.1:8790 を開きます。

```sh
pnpm build
pnpm start
```

ヘッダーでプロジェクト・agtx 到達・TUI 接続・Orchestrator 状態を照合してください。停止は逆順で、自分で起動した Agent Helm、agtx serve、TUI を終了します。他の作業で使っているプロセスや tmux ソケットは停止しないでください。

開発時は `pnpm dev` で BFF と Vite を起動し、**http://127.0.0.1:5173** を開きます。`localhost:5173` は許可 Origin と異なるため `forbidden_origin` になります。Ctrl+C で両方停止します。`pnpm dev:server` / `pnpm dev:web` による個別起動も可能です。

## 操作

- 「要対応」またはタスク一覧から詳細を開き、説明・依存・PR・ペインを確認します。画面は定期更新されます。非表示タブはポーリングを停止し、通信障害時は前回値と取得時刻を残します。
- Orchestrator の対象 socket/session/window とペインを確認し、指示を入力して「指示を送信」を押します。Ctrl/Cmd+Enter でも送れます。日本語・改行は tmux buffer 経由で渡し、最後に Enter を 1 回送ります。
- 承認は「選択肢を選ぶ → 対象・画面・キーを確認 → 送信」の 2 段階です。「以後確認しない」は以後の操作を広く許可する可能性があるため警告を表示します。
- 送信前に最新画面の指紋を比較します。画面が変わったら送らず再確認を求めます。「キーを送信しました」は処理の成功ではありません。送信後のペインを確認してください。
- **結果不明（unknown）は再送しないでください。** 「最新を確認」で画面を読み直します。自動再送は行いません。

## 設定と接続制約

`AGENT_HELM_CONFIG` で設定 JSON のパスを指定できます（既定 `./agent-helm.config.json`）。未知のキー、明示したファイルの不在、不正な値は起動エラーです。

| 環境変数 | 上書き先 |
|---|---|
| `AGENT_HELM_PORT` | BFF ポート |
| `AGTX_BASE_URL` / `AGTX_PROJECT` | agtx URL / プロジェクト名 |
| `AGENT_HELM_TMUX_SOCKET` | tmux ソケット名 |
| `AGENT_HELM_TMUX_SESSION` / `AGENT_HELM_TMUX_WINDOW` | セッション / ウィンドウ名 |

待受は `127.0.0.1` / `::1` のみ。agtx URL も HTTP loopback のルート URL に限定します。tmux 名は英数字・ハイフン・アンダースコアのみで、セッションとウィンドウを完全一致で解決します。複数ペインの場合は送信を拒否します。変更 API は Host・Origin・CSRF・JSON Content-Type を検証します。

## テスト

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
AGTX_CONTRACT=1 AGTX_BASE_URL=http://127.0.0.1:8799 AGTX_PROJECT=agent-helm pnpm test test/contract
```

Vitest は HTTP モック・UI・検証専用 tmux を使います。E2E は Chromium、tmux が必須で、PC 1280px / スマホ幅 390px を確認します。8791（BFF）、8792（モック）、8793（テスト制御）と `agent-helm-test` ソケットを使うため、同時に複数実行しないでください。終了時に専用ソケットを停止します。実 agtx 契約テストは opt-in で **GET のみ**です。

`pnpm mock:agtx` は独立した開発用 HTTP モックです。`?mock` は開発用状態表示のみのモックであり、入力先の隔離機能ではありません。送信検証には上記 E2E の専用環境を使ってください。

## 制約とトラブルシューティング

- 入力受付は空の `❯` / `›` プロンプトを保守的に検出します。入力中、承認中、メニュー、補完、認識できない画面では指示を拒否します。プレースホルダーでも拒否される場合があります。
- 改行を含む指示には送信先の bracketed paste 対応が必要です。非対応アプリは改行ごとに実行する場合があります。外部 TUI 操作との競合は完全には防げません。
- 承認は画面末尾 40 行から検出します。対応外・長すぎる画面、UI バージョン差では見逃す可能性があります。Claude の `Bash command` 見出しは質問の上方 12 行まで探索します。Claude 2.1.307 の番号なし trust 画面は検出して要対応に表示し、端末（agtx TUI）で操作する案内を出します。Web からキーは送信しません。Codex のレート制限によるモデル変更メニューは承認として扱いません。
- agtx のタスクキー集合は `y n 1 2 3 Enter Escape Up Down C-c`。画面にある選択肢でも集合外や単語全体を要求するものは Web から送れません。Orchestrator のキー集合とは異なります。
- agtx の Orchestrator / planning / review が permissions bypass で起動される環境では、通常の承認は出ません。検証では専用 Claude を manual モードで起動しました。
- Codex が動作中でも agtx が `phase_status=exited` / `agent_state=ended` と報告する実例があります。完了とは判断せずペインを確認してください。exited/null の active タスクも承認検出の対象です。
- `not_found` / `ambiguous`: tmux の socket/session/window と単一ペイン構成を確認します。Agent Helm は自動で対象を選び直しません。
- 「切断中」「到達不可」: agtx の実際のポート、TUI、設定を確認します。プロジェクト名は一意に解決できる必要があります。
- PR 状態不明: `gh` の認証・ネットワークを確認します。テスト結果は未取得として表示し、ペインの表示を成功判定へ変換しません。
- リクエスト ID の重複排除は BFF プロセス内だけです。再起動や履歴上限後には保持されません。
- agtx `/input` の `delivered:true` はキー配送を示し、承認の受理を保証しません。送信後に画面を再取得し、同じ承認が残ると「画面が変わっていません」と表示します。自動再送はしません。
- Codex trust（`enter continue`）は数字で選択し、同じ承認のカーソルが選択肢に一致した場合だけ Enter を送ります。exec 承認は数字のみです。
- 新規プロジェクトは事前に `claude` / `codex` でリポジトリを信頼してください。auto_trust=false では Claude の trust 画面に `/exit` が入り、Codex が起動しない事例があります。
- Codex / Claude が exited でも入力プロンプトがある場合は「入力待ち（完了確認待ち）」と表示します。実際の完了は端末で確認してください。
- agtx に到達できない場合、TUI 接続状態は「不明」です。

## 将来のリモート利用

現状はローカル専用です。将来リモート対応する場合は VPN/Tailscale 等の限定網、HTTPS リバースプロキシ、認証を用意し、BFF の Host/Origin 許可リストと CSRF 設計を合わせて変更・検証します。これらは今の設定だけでは有効になりません。この実装では外部公開やトンネル起動を行っていません。
