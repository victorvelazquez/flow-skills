# T4 — flow-contract-request

Status: verified awaiting merge
Branch: `feat/flow-contract-request`

## Authorized decisions

- Modernize the existing public `flow-request` workflow in place.
- Treat a configured target as a local repository path from `.flow/contract-targets.json` schema `flow-contract-targets/v1`; no network transport.
- Deliver immutable JSON records to `.flow/inbox/contract-request-<sha256>.json`, with an identical immutable requester-local fallback under `.flow/outbox/` when the target is unavailable.
- Preview and execute exactly one `--target` with one JSON-object `--request-json` per invocation; every cross-repository execution requires its own host-native approval before the approved runtime form is invoked.

## Tasks

- [x] Amend the T4 roadmap card with the decided contract and reconcile T3 merge evidence.
- [x] Add strict-TDD coverage for configuration, preview, approval, cross-repository delivery, and outbox fallback.
- [x] Implement the bounded runtime and host adapters without synthesized authority.
- [x] Refresh documentation, package manifests, and deterministic provenance assets.
- [x] Run focused/full verification and obtain independent review.
- [x] Record T4 as verified awaiting merge with exact evidence and conditional T5.

## Constraints

- No commit, push, PR, install, deploy, reconciliation, publication, or release.
- One writer only.
- Preserve the <=400 changed-line boundary unless an explicit size exception is recorded before review.
- Portable code cannot grant approval or delivery authority.
