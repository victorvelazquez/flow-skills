# Privacy-safe Flow PR finalize diagnostics

## Goal

Report an allowlisted finalize substep and stable failure class when an unexpected error prevents the second `--prepare --handle` operation, without revealing raw exception text, paths, handles, environment values, or PR content. Preserve the existing fail-closed result/recovery contract and the original exception when cleanup also fails. The earlier real invocation stopped in finalize before `--execute`; its discarded exception cannot be recovered retroactively.

## Scope and safety

- No `/flow-pr` retry, real `--prepare` or `--execute` against this repository, push, PR, merge, or Jira operation as a test. Use only temporary fixture repositories with mocked `gh` for focused tests.
- Keep established coded errors unchanged. Unknown or uncoded exceptions must map to a fixed public code and static diagnostic; never serialize caught messages/codes directly without an allowlist.
- Preserve runtime-owned intent/snapshot validation, one-use handles, cleanup and recovery boundaries. A cleanup failure must not replace the triggering error; report its residual-artifact limitation honestly.
- Preserve unrelated working-tree state and historical OpenSpec/task records. Installed OpenCode reference copies require backed-up activation only after source verification. Pi uses package resources.

## Work units

- [x] FD-1 — Add RED fixture assertions and implement bounded finalize-stage/class diagnostics. Route: one `gentle-ai-worker` (multi-file write). Scope: Flow PR CLI, failure result helper, focused fixture tests, output contract and only necessary skill text. Verify uncoded intent read, known coded failures, static privacy boundary and cleanup masking where deterministically testable. Rollback boundary: only FD-1 source/test/contract deltas.
- [x] FD-2 — Reconciled affected root/Pi/OpenCode provenance and independently verified focused behavior and package checks. Root/Pi/OpenCode verification passed (59/73/83 assets); the 75-entry dry-pack includes the runtime and output contract. Independent tests: 12 passed in the selected finalize/runtime fixture group; seven supporting files: 79 passed, 3 Windows skips, 0 failed. `node --check` and `git diff --check` passed (CRLF warning only). Activated the OpenCode runtime and output-contract copies byte-for-byte with source after backing up both at `~/.pi/agent/backups/flow-pr-finalize-diagnostics-activation-2026-09-25T19-32-29-284Z/`; independent pre/post source, lock, installed-copy hashes and Git status were unchanged. Route: bounded lock writer and `gentle-ai-verify`. Rollback boundary: FD-1 deltas, the four derived lock files, and those two backed-up installed copies. No live PR retry or publication probe.

ODD TDD: no active organic strict-TDD setting was found; use ordinary RED/GREEN with `node --test --test-name-pattern` against `tests/flow-pr.test.mjs` and focused helper tests. Forecast about 160 authored lines excluding generated locks; delivery strategy `ask-on-risk` if the review budget is exceeded. This correction request authorizes implementation, not a local commit or live PR retry; a fresh explicit slash invocation remains required for delivery.

## FD-1 evidence

Observed RED: focused run 8 passed, 1 failed (missing `substep` and `reasonCode` on uncoded malformed intent JSON). Observed GREEN: same focused run 9 passed, 0 failed; existing invalid-contract fixture remained green. Two subsequent P1 corrections wrap caught failures without mutating them and stage context loading as `context-read`; independent selected tests passed 2/2 and structural review confirms frozen-error cleanup ordering. A frozen-error fixture was not run, so that edge has structural rather than behavioral evidence. Cleanup is best-effort and can leave temporary artifacts. The roughly 735-line CLI source diff is dominated by formatting, but also contains the intentional semantic changes; one targeted restoration pass was blocked by recurring formatting, so this reviewability cost was accepted instead of looping. The original live exception remains unrecoverable.

## FD-2 lock reconciliation evidence

The parent independently confirmed two focused fixtures (2/2) and security review before this lock-only step. Pre/post source SHA256 remained unchanged: `scripts/flow-pr.mjs` `0f6407bd802ea33a63b220f1bf4ab71982384e8ff78b2f5e3b8802a0e64299fa`; `skills/flow-pr/references/output-contract.md` `92c3a69c884f3eb53c26740b29759fb24af6797bf0796ac7c8bcdd6c3f870af4`; `tests/flow-pr.test.mjs` `4dd61cd04c5a9746aae1ff8c0b66f3331a81fa2c783259c497e081104119ecc9`. Reconciled only these two source records in root/generation/Pi/OpenCode locks and their derived totals/identities. `node tools/flow-assets.mjs --verify`, `--verify --host pi`, `--verify --host opencode`, and `git diff --check` passed (the latter emitted an existing test-file line-ending warning). The subsequent independent package checks and backed-up OpenCode activation completed as recorded in FD-2; no live PR retry occurred.

## Evidence at start

Commit `0484531` left a clean feature branch. A manual `/flow-pr` invocation subsequently returned `runtime-failure` during finalize (`--prepare --handle`), before `--execute`; all publication effects were `not-attempted`. The generic `failureResult(_error)` discards the exception, and `finalize()` cleanup could mask an earlier error. Those facts locate the boundary, not the underlying cause. No live PR has been created by this attempt.
