## Exploration: Simplify `/flow-commit`

### Current State
`/flow-commit` currently couples a 1,531-line Git runtime to Gentle AI review authority. `scripts/flow-commit.mjs` discovers lifecycle/configuration, builds temporary review candidates, reads private review state, validates lineage and candidate trees, derives `planId`, heuristically groups work units, retries branch names, and then commits. This crosses the intended boundary: semantic grouping belongs to the skill/agent; deterministic Git effects belong to the runtime.

The current seven modified files overlap this change in only two places: `scripts/flow-commit.mjs` and `tests/flow-commit.test.mjs`. The other five modifications implement the separate `flow-skills-sync` work and its asset-lock/test updates; they must remain untouched. The repository has no existing `openspec/` configuration or base specs, so this change folder starts the OpenSpec artifacts without altering those pre-existing edits.

`/flow-pr` imports `deliveryPlanId`, `deliveryAuthorityId`, and `resolvePublicationDeliveryPolicy` from `scripts/lib/review-delivery-policy.mjs`; its behavior must remain unchanged. Conversely, `flow-work-units.mjs` is only used by `/flow-commit` and its tests. Asset installation mirrors every `flow-*` command, agent, script, skill, plus explicitly listed libraries; changed or removed mirrored assets require a synchronized manifest/lock update.

### Affected Areas
- `scripts/flow-commit.mjs` — rewrite as a small Git-only executor: NUL-safe inspection, protected-branch handling, exact staging, Conventional Commit validation, bounded index recovery, commit execution, and leftover reporting.
- `skills/flow-commit/SKILL.md` — move semantic grouping, branch/message decisions, and the one-shot execution request into the skill; remove review authority, lineage, plan ID, topology, and receipt language.
- `agents/flow-git-agent.md` — align the agent permission and workflow contract with the new inspect/execute interface; remove review authority wording.
- `commands/flow-commit.md` — likely only update its description if it still claims intelligent runtime grouping; retain the command-to-agent entry point.
- `tests/flow-commit.test.mjs` — replace Gentle AI mocks, review-topology tests, and `planId` assertions with Git-only executor safety coverage.
- `tests/flow-commit-harness.mjs` — remove or reduce; it currently exists solely to inject a mocked `gentle-ai` runner.
- `scripts/lib/flow-work-units.mjs`, `tests/flow-work-units.test.mjs` — remove with the runtime grouping heuristic, unless a new verified caller is introduced (none exists today).
- `scripts/lib/review-delivery-policy.mjs`, `tests/review-delivery-policy.test.mjs` — retain only the publication-facing API used by `/flow-pr`; remove commit-specific lifecycle, temporary-index, staged-candidate, lineage, and real-staged-delivery exports/tests.
- `flow-assets.json`, `.gitattributes`, `flow-assets.lock.json` — remove deleted explicit library ownership and refresh mirrored asset records only after the functional asset set is final.
- `tests/flow-assets-manifest.test.mjs`, `tests/flow-agent-contract.test.mjs` — update mirror and installed-agent assertions if the manifest or executor command contract changes.
- `commands/flow-auto-deliver.md` — preserve its documented reliance on `/flow-commit` for protected-branch creation and commit safety; it requires compatibility verification, not a behavioral rewrite.

### Approaches
1. **Git-only request executor** — Have the skill inspect the complete change set, make the semantic one-or-many commit decision, then send one explicit request containing the branch and exact commit units to a deterministic script.
   - Pros: Removes all Gentle AI dependencies from `/flow-commit`; keeps exact argv-safe Git mutations; supports multiple atomic commits; no persistent plan/authority protocol; cleanly preserves `/flow-pr`'s separate review adapter.
   - Cons: Requires a deliberate replacement request schema and test rewrite; the agent must supply valid semantic choices.
   - Effort: Medium.

2. **Minimally prune the current auto workflow** — Keep `--auto`, heuristic work units, dry-run/`planId`, and legacy modes while deleting direct Gentle AI calls.
   - Pros: Smaller immediate diff and fewer command-contract changes.
   - Cons: Retains the forbidden plan lifecycle and complexity, leaves semantics in deterministic code, and obscures the clean boundary; it does not meet the confirmed product decisions.
   - Effort: Medium initially, High in follow-up maintenance.

### Recommendation
Adopt the Git-only request executor. Retain only reusable mechanics: `parsePorcelainStatus`/NUL-safe status parsing, `runFileSafe` argv execution, protected-branch detection from `PROTECTED_BRANCHES`, exact path staging, index snapshot/restore before a failed commit, Conventional Commit title validation (`type(scope): outcome`) with an optional body, post-commit path/leftover verification, and structured results. Do not promise rollback of earlier successful units; stop at the first later failure and report completed and remaining units.

The skill/agent should inspect every changed path, choose one or more work units, provide exact file lists and messages, and provide an appropriate task branch when starting from a protected branch. The executor must validate that units are non-empty, disjoint, cover the requested current change set, use valid messages, and create the exact requested branch. It must visibly fail if that branch already exists—no suffix retry. Pre-existing or partial staging must be explicitly inspected and either incorporated safely into the exact request or rejected before mutation; index restoration applies only to the failing, uncommitted operation.

Non-goals: changing `/flow-pr`; replacing its review lifecycle; moving Git mutations to LLM-only execution; introducing a persistent plan protocol; restoring legacy `--analyze`, `--commit`, `--summary`, or `--create-branch` modes without a verified consumer; modifying the five unrelated `flow-skills-sync` edits.

### Risks
- `review-delivery-policy.mjs` is shared with `/flow-pr`; deleting it wholesale would break publication review validation. Preserve its publication-facing exports and prove `/flow-pr` remains unchanged.
- The current asset lock is already modified by unrelated work. Regenerating or editing it before resolving that work could overwrite its metadata or records; reconcile the final lock in the same intentional work unit without discarding existing changes.
- Multi-commit execution is not transactional. Hooks, concurrent Git changes, or a later commit failure can leave earlier commits in place; report this state rather than attempting global rollback.
- Pre-existing partial staging and hook-added paths are correctness hazards. Require exact staged-path verification, preserve the index on a failed pre-commit operation, and keep a bounded compare-and-swap HEAD recovery only for a proven post-commit mismatch.
- The installed asset mirror and `flow-auto-deliver` depend on the command/agent contract. Validate the installed generation and protected-branch behavior after changing the executor interface.

### Ready for Proposal
Yes — propose a narrow Git-only `/flow-commit` rewrite, the corresponding skill/agent/test/mirror updates, and deletion of commit-only grouping and review-policy code. Keep `/flow-pr` and the unrelated seven-file work out of scope.
