# Approval pane fixtures

These fixtures exercise the formats described in `.agtx/plan.md`.
The original Codex task captures were not embedded in that plan, so the Codex
command and trust examples are reconstructed from its documented format,
including `(y)`, `(p)`, `(esc)`, wrapped questions, and confirmation footers.
They are not byte-for-byte recordings of a live terminal.

Claude examples are estimated and identified by `.estimated.txt` filenames.
Replace/verify these fixtures against live screens during T6. No live tmux
session is used by these tests. Number keys are sent without an automatic Enter;
`sent` reports key delivery, not completion of approval.
