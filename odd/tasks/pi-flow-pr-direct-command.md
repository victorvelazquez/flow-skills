# Pi Flow PR Native Confirmation

## Objective

Expose one interactive Pi `/flow-pr` command that prepares and finalizes with the existing runtime, presents its complete bounded approval summary through one native confirmation, and executes at most once on affirmative approval. Merge remains separate. Invocation alone is never consent.

## Decision History

The proposed zero-prompt direct-typed boundary failed independent verification twice. `registerCommand` plus TUI mode could not prove typing; source-aware `input` was also insufficient because installed Pi submits CLI startup `initialMessage(s)` through `session.prompt()` without source, which defaults to `interactive`, the same source as editor input. Registered commands also preempt `input`. The user therefore chose one native confirmation per PR. No surrogate origin signal may replace it.

A concurrent pi-lens formatter changed four WIP files during the earlier review. Fresh hashes were recorded before this revision; original untracked preformat bytes cannot be certified. WIP is preserved without cleanup.

## Implementation Contract

- Register an extension command `flow-pr`; allow only interactive TUI with available confirmation UI.
- Run runtime prepare, narrowly materialize semantic intent, and finalize. Preserve `schema`, `labels`, `updateExisting`, `deliveryMode`, and `push` byte-for-byte.
- Validate and present the finalized runtime approval: repository, branch/base, base authority, push/PR action, title, body size/digest, draft, labels, authorized updates, and delivery target. Do not reveal handles/temp paths.
- Call `ctx.ui.confirm` once immediately before execute, without a timeout; wait for explicit Yes/No/Esc. Only `true` permits exactly one `--execute --handle`; false, undefined, thrown UI error, absent UI, or malformed/oversized summary stops without execute. Show a bounded human-readable publication summary and body preview, not raw JSON. Runtime revalidates the immutable handle.
- Do not publish raw PR template content with unvalidated claims. Pi direct drafting uses a generic body with validation marked `Not provided`; existing draft state remains the runtime intent default.
- Delegate no publication: the Pi `flow-pr` agent has only `read`, no shell/edit. This does not restrict unrelated parent agents' shell access.
- OpenCode `ask` remains unchanged. The shared host adapter contract has no Pi invocation exception.
- No commit, push, PR, merge, or package publication while implementing.

## Superseded OpenCode-Like Presentation Experiment (historical)

The following experiment was implemented in WIP but superseded by the user's simpler decision. Its model-driven semantic drafting, in-extension Jira renderer, template parser, and shared validation-unknown policy are **not** the target. Preserve this history for audit; remove only those experimental source/test/package additions with targeted edits, without resetting unrelated WIP.

## OpenCode-Like Presentation Restoration (superseded details)

Preserve the working direct command and its one native, untimed confirmation immediately before runtime execute. Restore semantic drafting and a complete copyable Jira comment without granting a model publication authority. Bare `/flow-pr` remains viable with no special evidence syntax: Pi may consult the runtime's compact candidate/commit facts and one safe repository PR template for conservative semantic drafting. Explicit completed-task context is optional, bounded, and provenance-aware; an older ambiguous session history is not evidence. A PR template is structural guidance, not evidence of completed work or validation. A tool-free model may propose only `title`, `body`, and `draft` (the runtime intent's existing draft default remains authoritative unless explicitly requested). Reject unavailable or malformed drafting before publication instead of silently claiming parity with a generic fallback. Operational intent fields remain byte-for-byte unchanged. The human confirmation must show the complete material PR body within a strict bound, not a truncated preview.

Only after `flow-pr/result-v1` reaches verified `success` or `noop` with a non-null PR may a separate tool-free presenter apply `references/output-contract.md` to the verified publication candidate, explicit completed-task context, and (only if necessary) the exact verified commit range. Emit the complete `JIRA COMMENT` fenced block durably in the Pi transcript; never use a transient notification as its only copy. Suppress the entire block when technical change, concrete manual QA, or render authority cannot be established. Derive manual QA from verified change only when concrete and justified; report executed checks only when an explicit current-task context ties exact command and outcome to this candidate, otherwise do not claim them. Never infer executed checks from plans, test files, paths, or templates. The block is presentation-only: no Jira API, Git/gh mutation, execute handle, or additional approval. If model output is unverifiable, fail closed or suppress Jira; do not invent evidence.

Implementation is bounded to the Pi adapter/presentation, skill instructions, tests, and mechanically generated provenance locks. OpenCode's `ask` remains unchanged. Preserve all existing worktree changes; no reset, commit, push, PR, merge, or live `/flow-pr` while implementing.

## Restoration Tasks

- [x] Prove the installed Pi model/session/display APIs with read-only source and a nonpublishing fake harness.
- [x] Add failing adapter tests for bare semantic drafting, safe template, evidence boundaries, full-body confirmation, and unavailable model.
- [x] Implement bounded tool-free fact selection and deterministic semantic drafting without changing runtime authority or the single confirmation.
- [x] Add failing and passing tests for verified Compact/Detailed Jira, suppression, and durable full-fence display.
- [x] Regenerate provenance locks, run focused regression and diff checks, and obtain independent read-only verification.

## Narrow Verified-Result Handoff (current objective)

Keep the earlier direct `/flow-pr` prepare/finalize/one untimed native confirmation/exactly one execute runtime workflow and conservative generic PR body. After the runtime returns a verified `flow-pr/result-v1` `success`/`noop` with a non-null PR, send a bounded, sanitized projection of that result into the **current** Pi agent turn using `pi.sendMessage({ customType: 'flow-pr-verified', content: ..., display: false }, { triggerTurn: true, deliverAs: 'followUp' })`. The projection carries verified publication/candidate facts and PR URL but no runtime handles, temp paths, raw snapshots, or model execution authority. The agent reads the existing `skills/flow-pr/references/output-contract.md` and either emits its complete fenced, copyable `JIRA COMMENT` or suppresses it under that contract. It must not call Jira, mutate Git/GitHub, infer executed tests, or request a second publication approval. If message delivery fails after verified publication, report the verified PR URL/status and the presentation failure; never say publication stopped or retry execute.

No direct model API call, in-extension Jira renderer, extra production module, new shared output policy, or Git/Jira tool action is required. Remove only the parity experiment's own WIP entries/files and restore the earlier direct command/package discovery behavior. No live `/flow-pr`, commit, push, PR, merge, or Jira call is part of implementation.

## Narrow Handoff Tasks

- [x] Add RED fake-runtime/context tests for verified one-time handoff, zero handoff on decline/failure/no PR, bounded projection without handles, and post-publication display failure.
- [x] Remove experimental parity code/assets while preserving earlier direct command and one confirmation; implement one verified-result handoff.
- [x] Restore the shared output contract and package/manifest to the pre-experiment WIP surface, regenerate only needed provenance locks, and run focused/package/diff checks.
- [x] Obtain independent read-only verification; do not test live publication.

## Current Verification

The exact four-file focused suite passed 56/56, `git diff --check` passed with CRLF warnings, and `verifyProvenance(process.cwd())` passed after three-lock regeneration. An independent read-only verifier reported no P1/P2 blockers on stable extension/helper hashes. The two experiment-created presentation files were targeted-deleted; package/manifest omit them. No live Pi TUI confirmation, `/flow-pr` publication, or Jira API call was exercised.

## Historical Verification (superseded candidate)

TDD with fake runtime/model/context covers source-backed title/body, missing or untrustworthy evidence, unavailable model, full-body approval and cancellation, exactly one execute, verified Compact/Detailed Jira, suppression, and durable lossless display. The exact five-file focused suite passed 65/65; `git diff --check` and regenerated provenance passed. An independent read-only verifier reported no P1/P2 blockers. No live Pi TUI confirmation or PR publication was exercised. Bare `/flow-pr` requires an available model for fact-ID selection but no special evidence syntax; code-change Jira requires an optional explicit, current-session, candidate-headOid-bound evidence block with concrete manual QA. When absent, Jira is suppressed. Documentation-only verified candidates can derive a concrete document review step. No Jira API mutation occurs.
