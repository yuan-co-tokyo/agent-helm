# Agent Helm

agtx 用ローカル BFF と React UI の基盤です。現段階ではセッション API と安全な agtx アクセスを実装し、状態・タスク詳細・承認・指示の API と UI は後続タスク用の未実装スタブです（HTTP 501）。実 tmux 操作はまだ行いません。本格的な利用ガイドは統合タスクで整備します。

## 開発

Node.js 22.12 以降（新しい LTS 推奨）、pnpm 10.19.0 を使用します。

```sh
pnpm install
cp agent-helm.config.example.json agent-helm.config.json
pnpm mock:agtx
# 別のターミナルで
pnpm dev
```

開発 UI は http://127.0.0.1:5173、BFF は http://127.0.0.1:8790 です。`pnpm dev` は両プロセスを起動し、Ctrl+C で終了します。`pnpm dev:server` / `pnpm dev:web` で個別にも起動できます。開発プロキシは、この UI オリジンの API リクエストだけ Origin を BFF に合わせます。BFF 自体の検証は常に有効です。開発時のポート変更には Vite のプロキシ設定も合わせてください。

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

本番ビルド後は http://127.0.0.1:8790 から UI と API を同一オリジンで配信します。agtx に接続できなくても起動します。`pnpm mock:agtx --port 8788` でモックのポートを変更できます。

## 設定

`AGENT_HELM_CONFIG` で JSON パスを指定できます（既定 `./agent-helm.config.json`）。明示したファイルが存在しない場合、未知の設定項目がある場合は起動を拒否します。

環境変数による上書き: `AGENT_HELM_PORT`, `AGTX_BASE_URL`, `AGTX_PROJECT`, `AGENT_HELM_TMUX_SOCKET`, `AGENT_HELM_TMUX_SESSION`, `AGENT_HELM_TMUX_WINDOW`。

待受アドレスは `127.0.0.1` / `::1` のみ、agtx URL は HTTP の loopback ルート URL のみです。tmux 対象は明示必須で、英数字・ハイフン・アンダースコアのみを許可します（tmux の対象構文との混同を避けるため、ドットも拒否）。テストでは `agent-helm-test` ソケット名を使います。

API の変更操作には同一 Origin、セッション API の CSRF トークン、JSON Content-Type が必要です。タスクへの入力は限定キーのみで、自由テキスト・遷移・CRUD は提供しません。送信失敗の `unknown` は結果不明を意味し、自動再送しません。

## 追加の検証

```sh
pnpm exec playwright install chromium
pnpm test:e2e
AGTX_CONTRACT=1 AGTX_PROJECT=agent-helm pnpm test
```

E2E は desktop/mobile の画面雛形を確認します。実 agtx 契約テストは明示的に有効化した場合だけ GET を実行し、入力は送りません。モック HTTP テストはエフェメラルポートを使用します。

`src/shared/api.ts` が UI/BFF 契約、`src/server/agtx` と `src/server/orchestrator/types.ts` が外部アクセス契約です。後続ルートは `src/server/routes/*` の登録関数を置き換えて実装できます。ペイン応答の複数形式を暫定サポートしていますが、実機の成功応答は統合時に確認が必要です。

Orchestrator input uses an exact tmux session/window match and requires a single live
pane with an empty `❯` or `›` prompt. Approval prompts, menus, completion lists and
unrecognized screens block instructions. Placeholder text can therefore also block
input. Detection is conservative and depends on terminal layout; an external input
can still race the final target check. The adapter never starts or selects a session.

Instructions are pasted through a temporary tmux buffer and followed by one Enter.
Terminal editors must support bracketed paste for multiline instructions: tmux
converts LF to CR, which editors normalize as pasted newlines; applications without
bracketed paste may act on each newline immediately. A failure after paste begins
returns `unknown` and is never retried automatically. Request IDs deduplicate requests
within this server process (the last 500 IDs); restarting or cache eviction removes
that protection. Instruction bodies are not logged.
