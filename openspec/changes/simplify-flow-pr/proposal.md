# Proposal: Simplify `/flow-pr`

## Intent and User Value

Replace the 3,976-line mixed publication, promotion, and review state machine—and second Gentle AI authority implementation—with a small deterministic Git/GitHub-only workflow: inspect facts, obtain one explicit approved request, then execute. Maintainers gain a predictable way to publish one clean committed branch as one PR without hidden commits, review authority, promotion behavior, or history rewriting.

## Scope

### In Scope
- Remove all Gentle AI coupling from `/flow-pr` surfaces and, after caller proof, delete dead review, promotion, chain, policy, test, asset, and reference modules.
- Add side-effect-free inspection and immutable request execution for explicit base, target repository, head identity, title, body, optional labels, and same-repository or explicit fork delivery.
- Validate clean branch/HEAD/root/remotes/base/refs; use argv-safe `git`/`gh`; perform only normal non-force push/upstream and exact PR create/update/noop reconciliation with postcondition verification.
- Block ambiguous or drifted PR state; preserve unrelated labels; report structured remote effects and partial recovery.

### Out of Scope
- Promotion, releases, versions, tags, chain/tracker PRs, lifecycle aliases, managed review authority, automatic commits, force/rewrite/merge/retarget behavior, or speculative compatibility.
- Changes to `/flow-commit` or Gentle AI.
- Core enforcement of issue-first/type-label policy. Repository-policy/skill adapters are optional; Jira text and playbook sync are independent post-publication outputs/actions.

## Capabilities

### New Capabilities
- `deterministic-pr-publication`: Inspect, approve, and safely reconcile one exact branch-to-PR publication with idempotency and partial recovery.

### Modified Capabilities
None; no existing OpenSpec capabilities are present.

## Approach

The skill/agent owns semantics and explicit approval. The runtime owns deterministic mechanics only and MUST NOT create commits. An existing exact PR noops when matching, updates only explicitly authorized compatible fields, and never duplicates. Push success followed by PR failure is partial: preserve the branch and require fix-forward reinspection, never rewrite history.

## Affected Areas

| Area | Impact |
|---|---|
| `scripts/flow-pr.mjs`, `commands/flow-pr.md`, `agents/flow-pr-agent.md`, `skills/flow-pr/` | Replaced/simplified |
| `scripts/lib/`, `tests/`, asset manifests and mirrors | Dead surfaces removed; contracts rebuilt |

## Risks

- Remote/base/fork drift or PR ambiguity could target the wrong authority; bind and revalidate exact identities before mutation.
- Git/gh inputs are injection boundaries; require validated data and `shell: false` argv execution.
- Current clean branch `feat/guided-flow-skills-sync` has no upstream; planning performs no remote mutation.
- **Size exception:** the maintainer approved a single-PR `size:exception` before apply. The approval is recorded in Engram `sdd/simplify-flow-pr/delivery` (#6882); scope remains one atomic replacement/deletion change.

## Rollout / Rollback

Land the incompatible replacement and deletions atomically after caller proof. Roll back by reverting that change; never compensate with remote history rewrites. Partial publications recover through fresh inspect/request reconciliation.

## Success Criteria

- [ ] No `/flow-pr` Gentle AI, promotion, release, chain, commit-creation, or rewrite surface remains.
- [ ] One approved exact request safely creates, explicitly updates, or noops one PR and verifies postconditions.
- [ ] Drift, ambiguity, and partial failure fail closed with actionable structured recovery.
- [ ] Optional policies and post-publication outputs cannot determine core PR success.
