# Approval pane fixtures

These fixtures exercise the formats described in `.agtx/plan.md`.
The original Codex task captures were not embedded in that plan, so the Codex
command and trust examples are reconstructed from its documented format,
including `(y)`, `(p)`, `(esc)`, wrapped questions, and confirmation footers.
They are not byte-for-byte recordings of a live terminal.

Reconstructed Claude examples are identified by `.estimated.txt` filenames.
Captured Claude and Codex screens are identified by `.real.txt` filenames.
No live tmux session is used by these detector tests. Number keys are sent without an automatic Enter;
`sent` reports key delivery, not completion of approval.

Claude の番号なし trust 実画面は terminalOnly として検出し、要対応と端末操作の案内を表示します。Web からキーは送信しません。
