# Approval pane fixtures

These fixtures exercise the formats described in `.agtx/plan.md`.
The original Codex task captures were not embedded in that plan, so the Codex
command and trust examples are reconstructed from its documented format,
including `(y)`, `(p)`, `(esc)`, wrapped questions, and confirmation footers.
They are not byte-for-byte recordings of a live terminal.

Reconstructed Claude examples are identified by `.estimated.txt` filenames.
Captured Claude and Codex screens are identified by `.real.txt` filenames.
No live tmux session is used by these detector tests. Exec approvals send only the number; `enter continue` trust prompts send Enter only after verifying the same fingerprint and selected cursor;
`sent` reports key delivery, not completion of approval.

Claude の番号なし trust 実画面は terminalOnly として検出し、要対応と端末操作の案内を表示します。Web からキーは送信しません。

## T10 placeholder fixtures

`codex-placeholder.estimated.ansi.txt` と `claude-placeholder.estimated.ansi.txt` は
それぞれ SGR 2（dim）と SGR 90（灰色前景）を使った推定データです。
実 agtx `/pane` からの取得は未実施であり、実クライアントの SGR を記録したものではありません。
Codex の `Explain this codebase` は既存 `codex-idle-input.txt` の文言を再利用しました。
隔離 tmux テストは printf で SGR 2 / 90 / 38;5;245 を描画し、capture-pane -e が
装飾を保持することと入力待ち判定を確認します。既存セッションは操作しません。
Claude 系 TUI がプレースホルダー先頭文字にカーソルを反転表示（SGR 7）で描く場合に備え、
反転セル直後が dim/灰色のときのみ反転セルをカーソルとして除去します（`test/server/text.test.ts`）。
