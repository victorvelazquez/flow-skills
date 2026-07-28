# Design: Simplify `/flow-commit`

## Technical Approach

Replace the 1,531-line runtime with a Git-only inspect/execute executor. The agent reads inspection JSON, the skill chooses semantic units, and one request performs bounded Git mutations. Inspection is ephemeral: no `planId`, delayed plan, lifecycle adapter, or persisted state.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Inspect then execute | Two invocations; canonical NUL-safe state | Chosen; execute revalidates embedded repository/branch/HEAD, not a plan token |
| One-shot runtime planning | Smaller interface, but returns semantics to code | Rejected |
| LLM-issued `git add`/`commit` | Flexible, but no deterministic isolation or verification | Rejected |
| Retain `--auto`/`planId` | Familiar, but preserves forbidden delayed authority workflow | Rejected |
| Reject pre-staged indexes | Less permissive, but makes ownership and restoration exact | Chosen; users must unstage intentionally before execution |

## Data Flow

`/flow-commit` command → `flow-git-agent` → `flow-commit` skill (inspect diff, choose branch/units/messages) → request JSON → `flow-commit.mjs` → argv-safe Git → structured result.

Inspection is allowed; mutating execute requires approval. Direct commit, push, PR, audit, edit, and arbitrary scripts remain denied. `flow-auto-deliver` adopts inspect/execute; `/flow-pr` remains unchanged.

## Interfaces / Contracts

Inspection emits `flow-commit/inspection-v1`: `{repositoryRoot, branch, head, protected, changes:[{path,indexStatus,worktreeStatus}], stagedPaths}` using repository-relative literal paths.

Execution accepts one JSON file/stdin document:

```json
{"schema":"flow-commit/request-v1","expected":{"repositoryRoot":"/repo","branch":"main","head":"<oid>"},"branch":{"action":"create","name":"feat/simplify-flow-commit"},"units":[{"paths":["scripts/flow-commit.mjs"],"title":"refactor(commit): simplify git execution","body":"Optional non-redundant context."}]}
```

`branch.action` is `keep` (no `name`) or `create` (required `name`). Protected branches require `create`; unprotected branches allow either. Ref collisions fail—no suffixing. Ordered units are non-empty; paths are unique, disjoint, and their union equals current changed paths. Reject repository/branch/HEAD drift, merge/rebase state, absolute/escaping paths, staged paths, empty changes, and titles not matching `type(scope): outcome`.

Results use `flow-commit/result-v1`: `{success,status,repository,branch,completedUnits,failedUnit,remainingUnits,leftovers,nextAction}`. Completed units include OID, paths, title, and body. Exit `0`: noop/completed; `1`: zero-progress failure; `2`: partial. JSON always uses stdout; diagnostics may use stderr.

## Execution and Recovery

Before each unit, revalidate branch/HEAD and remaining path coverage, require an empty index, then snapshot the exact index bytes immediately before `git add --all -- <unit paths>`. Verify the staged NUL path set equals the unit and capture `write-tree`; commit with hooks enabled and separate `-m` argv values. Verify new HEAD has the prior HEAD as parent, committed NUL paths and tree equal the staged snapshot, message equals the request, index is empty, and remaining changes equal remaining units.

On pre-commit failure, restore only that unit's index. On proven post-commit mismatch, use `git update-ref HEAD <old> <created>` only after confirming runtime-created HEAD, then restore the index. CAS collision preserves concurrent HEAD. Earlier commits remain; execution is not transactional.

## File Changes

| Action | Files |
|---|---|
| Rewrite | `scripts/flow-commit.mjs`, `skills/flow-commit/SKILL.md`, `agents/flow-git-agent.md`, `commands/flow-commit.md`, `tests/flow-commit.test.mjs` |
| Modify | `scripts/lib/review-delivery-policy.mjs` and its test: remove commit-only exports while preserving `resolvePublicationDeliveryPolicy`, `deliveryPlanId`, and `deliveryAuthorityId` used by `/flow-pr`; `commands/flow-auto-deliver.md`; asset tests |
| Delete | `tests/flow-commit-harness.mjs`; `scripts/lib/flow-work-units.mjs` and its test after caller search remains empty |
| Reconcile | Remove deleted library entries from `flow-assets.json` and `.gitattributes`; patch only affected records in `flow-assets.lock.json`, preserving its unrelated dirty metadata/records and the other four unrelated edits |

The runtime is rewritten around status parsing, validation, one unit loop, and output serialization rather than incrementally preserving legacy modes. The single PR must stay within 800 reviewed lines; if deletion accounting makes that impossible, tasks must surface the budget conflict before apply rather than hide it.

## Testing Strategy

Use `node:test` temporary repositories. RED-first coverage: schema/state drift, coverage overlap/gaps, protected/colliding branches, Conventional Commit/body handling, hostile NUL paths, staged-index rejection, hooks, exact commit/tree/message checks, index restoration, CAS collision, and second-unit partial failure. Contract tests prove agent permissions, auto-deliver wording, asset consistency, deleted callers, and unchanged `/flow-pr` publication APIs.

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior and planned RED tests |
|---|---|---|
| Documentation-like paths | Applicable | Treat `requirements.txt`, `CMakeLists.txt`, executable MD/MDX, and `README.sh` literally; never classify/execute; exact-path tests |
| Git repository selection | Applicable | cwd-resolved root must equal request; reject `git -C`, relative-root, and absolute-root mismatches; selector tests |
| Commit state | Applicable | reject staged/empty index drift and never use `commit -a`; staged, `-a` absence, empty-index tests |
| Push state | N/A | Runtime never pushes |
| PR commands | N/A | Runtime never invokes PR tooling |

## Migration / Rollout

Ship command, agent, skill, runtime, tests, and mirror metadata together. Roll back the PR before release; after partial execution, fix forward or manually revert verified commits. Defer analogous `/flow-pr` cleanup to a future change.

## Open Questions

None.
