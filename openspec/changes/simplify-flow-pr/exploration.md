## Exploration: Simplify `/flow-pr`

### Current State
`/flow-pr` is a four-layer publication flow: `commands/flow-pr.md` routes to `gentle-orchestrator`; it delegates to `agents/flow-pr-agent.md`; `skills/flow-pr/SKILL.md` directs the workflow; and `scripts/flow-pr.mjs` executes Git/GitHub operations. The 3,976-line runtime currently mixes three concerns: semantic PR content and label policy, ordinary task-branch publication, and a Gentle AI-backed promotion/review control plane.

The ordinary `--auto` path checks cleanliness, fetches `origin`, scans branch/base/diff context, derives a `planId`, validates Gentle AI publication authority, pushes, and creates, updates, or no-ops a PR after GitHub verification. Integration branches take a separate promotion path that can prepare release branches, create version commits/tags, coordinate native review capabilities/lineages/receipts, create draft bump and production PRs, and reconcile readiness. This conflicts with the requested objective because `/flow-pr` can create commits and carries an independent review authority.

The current branch is clean: `feat/guided-flow-skills-sync` is two commits ahead of `origin/main` (`529f870`, `c614e4b`) and has no upstream. `origin` fetch/push both target `https://github.com/victorvelazquez/flow-skills.git`. No fetch, push, PR, or other remote mutation was performed. Clone-local review mode is disabled/unmanaged per preflight.

#### Responsibility Classification

| Responsibility | Classification | Direction |
|---|---|---|
| Clean committed branch, repository identity, exact ref/HEAD checks, safe `git push`, `gh` PR query/create/update, postcondition verification, recovery output | Core Flow value | Retain in a small executor using argv arrays and `shell: false` |
| Internal snapshot, semantic intent, revalidation, title/body/label pass-through | Simplify | Replace `--auto`/`planId` with compact prepare → one approval → claimed handle execute |
| Project issue policy, type-label mapping, Jira text, playbook sync, fork policy extensions | Optional adapters | Keep outside the core runtime and invoke only when explicitly configured/selected |
| Gentle AI capabilities, status/start/finalize/validate, lineages, receipts, authority schemas, review gates/topology, causal admission, private review state | Gentle AI duplication | Remove from `/flow-pr` completely |
| Chain plans/trackers, release/version/tag automation, integration-to-production promotion, dynamic lifecycle aliases, CI evidence, managed PR-body policy | Historical/speculative complexity | Remove; none is needed to publish one committed branch without rewriting history |

The current runtime uses argv-safe `runFileSafe` for most Git and `gh` calls, including explicit `--repo` routing. However, legacy scan/version helpers still use shell-string `runSafe` commands. The replacement should use argv-only process execution throughout and treat all refs, paths, labels, titles, and body content as data.

### Affected Areas
- `scripts/flow-pr.mjs` — replace the 3,976-line multi-mode runtime with a Git/GitHub-only prepare/execute executor; remove `--auto`, promotion, chain, version, tag, and review modes.
- `commands/flow-pr.md`, `agents/flow-pr-agent.md`, `skills/flow-pr/SKILL.md` — replace orchestrator/reviewer loops with compact preparation, path-scoped semantic intent, one execute permission approval, and recovery guidance.
- `tests/flow-pr.test.mjs` — replace 57 authority/promotion/chain-heavy tests with focused temporary-repository tests for inspection, request drift, push, PR reconciliation, and partial recovery.
- `tests/flow-pr-harness.mjs`, `tests/promotion-review-runtime.test.mjs`, `tests/promotion-review-coordinator.test.mjs`, `tests/review-delivery-policy.test.mjs`, `tests/review-causal-admission.test.mjs`, `tests/flow-chain-plan.test.mjs` — delete: they test only the removed review, authority, or chain mechanisms.
- `scripts/lib/review-delivery-policy.mjs`, `scripts/lib/promotion-review-coordinator.mjs`, `scripts/lib/review-causal-admission.mjs`, `scripts/lib/flow-chain-plan.mjs` — delete after the `/flow-pr` rewrite; repository search found no production callers other than `/flow-pr`.
- `scripts/lib/flow-branch-policy.mjs`, `scripts/lib/flow-check-evidence.mjs`, `scripts/lib/flow-delivery-config.mjs`, `scripts/lib/flow-pr-body.mjs`, `scripts/lib/flow-pr-labels.mjs`, `scripts/lib/flow-pr-prs.mjs`, `tests/flow-delivery-modules.test.mjs` — become dead if the new executor inlines its small GitHub argv builders and accepts semantic metadata directly; no independent production caller was found.
- `skills/flow-pr/references/chain-plan.md`, `skills/flow-pr/references/output-contract.md` — remove or replace with the small request/result contract; the chain reference is dead.
- `tests/flow-agent-contract.test.mjs`, `tests/install.test.mjs` — update installed agent permissions and command-contract assertions.
- `flow-assets.json`, `flow-assets.lock.json`, `.gitattributes` and associated asset tests — remove deleted library/reference records and refresh only final affected mirror records.

### Approaches
1. **First-principles prepare/handle executor** — Preparation exposes compact drafting facts; the skill/agent writes small semantics to a runtime-owned temp file; one approved, atomically claimed handle performs deterministic publication.
   - Pros: Removes all Gentle AI coupling and historical modes; preserves safe Git/GitHub mutations; makes approval and recovery explicit; supports create/update/noop idempotency without persistent authority state.
   - Cons: Requires a deliberately incompatible runtime/skill/test rewrite and an explicit decision about optional project adapters.
   - Effort: High.

2. **Prune Gentle AI from the existing `--auto` runtime** — Retain scan, `planId`, managed body/labels, chain, and promotion-compatible modes while deleting direct native review calls.
   - Pros: Smaller conceptual migration for existing invocations.
   - Cons: Retains a speculative publication state machine, runtime semantic decisions, release mutations, and most of the 3,976-line surface; does not meet the requested architectural boundary.
   - Effort: High.

3. **Agent-only Git/GitHub execution** — Remove the runtime and let the agent call `git` and `gh` directly.
   - Pros: Fewest runtime files.
   - Cons: Loses deterministic request validation, argv construction, idempotent reconciliation, and bounded partial-failure reporting.
   - Effort: Low initially, High operational risk.

### Recommendation
Adopt the first-principles executor and intentionally break the legacy CLI. The minimal flow should be:

1. `--prepare --base <ref>` keeps the canonical SHA-bound snapshot internal and emits `flow-pr/prepare-context-v2` with compact repository, branch/base, delivery, existing-PR metadata, commit subjects, and changed paths. It creates a random expiring handle plus one empty `intent.json` under a supported standard OS temp root.
2. The skill/agent selects title, body, optional labels, update authorization, publish/verify mode, and same-repository or explicit fork delivery, then writes only `flow-pr/intent-v2` to the returned path. Custom temp roots fail early rather than gaining broad permissions.
3. `--prepare --handle <handle>` reinspects authority, validates intent, stores the full `flow-pr/request-v2` internally, and returns only a concise approval summary with body length/digest. Full snapshots, bodies, and request JSON do not round-trip by default.
4. The single human approval is the permission prompt for `--execute --handle <handle>`. Execute atomically creates an exclusive claim before reinspection or mutation; concurrent and abandoned claims fail closed. It then revalidates root, branch, HEAD, clean state, remotes, upstream, base, delivery, and PR authority.
5. The executor pushes only the exact branch with normal non-force semantics, reconciles create/update/noop, and verifies GitHub postconditions. Default `flow-pr/result-v1` output contains compact effect states and verified public PR metadata; `--verbose` explicitly adds diagnostics. Partial, failed, drifted, or unknown outcomes require fresh preparation and approval.

The MVP should require an explicit base and target repository in the request. Same-repository delivery is the default safe case. Fork delivery is feasible only as an explicit request that separately validates the push remote and PR target repository and uses an approved `<owner>:<branch>` head; it must never be inferred from a URL heuristic. Do not fetch or publish during this exploration.

Issue-first checking is not core: `branch-pr` mandates an approved linked issue and a `type:*` label, while the current `/flow-pr` explicitly forbids issue operations. Keep that as a repository-policy adapter evaluated by the skill before request creation, not in the core executor. Labels similarly become optional explicit metadata; preserve unrelated labels rather than enforcing a Flow-owned type-label taxonomy. Jira output is semantic agent text, not a GitHub publication dependency. Playbook sync is an independent post-publication command, not part of publication success. Chain PRs and auto-deliver integration are out of scope for the current single-PR decision and have no demonstrated core caller.

The 800-line single-PR budget is not realistic. Deleting or replacing `scripts/flow-pr.mjs` alone accounts for 3,976 changed deletion lines before its replacement, and the authority/chain tests and dead modules add several thousand more. A first-principles cleanup will likely exceed 5,000 changed lines. Count deletions; do not hide this in a rewrite. The proposal may proceed, but tasks must record an explicit `size:exception` or the delivery strategy must change before apply.

### Risks
- A clean rewrite can accidentally regress remote/base/fork handling. The request must bind repository, branch, HEAD, base ref/OID, target repository, and head identity; ambiguous or drifted state must fail before push.
- Push can succeed while PR creation/update fails. Preserve the pushed branch, return deterministic recovery facts, and reconcile by querying the exact PR relationship on a fresh request; never force-push, rewrite commits, or create compensating commits.
- `gh` and Git-controlled values are command-injection boundaries. Use `runFileSafe`/`spawnSync` argv arrays with `shell: false`; eliminate `runSafe` shell-string paths from the new executor; validate refs with Git and reject control characters in request text where applicable.
- Removing listed mirrored assets requires an exact manifest/lock reconciliation. Existing local commits and unrelated `flow-skills-sync` work must remain intact.
- The cached single-PR strategy conflicts with the measured review budget. This needs an explicit exception before implementation, despite chain PRs being intentionally out of scope.

### Ready for Proposal
Yes — propose the incompatible Git/GitHub-only inspect/request executor, removal of all Gentle AI, promotion, chain, and release behavior, adapter boundaries for issue/labels/Jira/playbook/forks, and a documented single-PR size exception. Non-goals: modify Gentle AI; create commits, tags, release branches, merge/retarget/rebase/force-push; perform review lifecycle work; implement chain PRs; or publish during planning.
