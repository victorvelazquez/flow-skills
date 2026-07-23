---
name: flow-pr
description: Push branch + create GitHub PR using the runtime script as the source of truth for automatic happy-path execution, production guardrails, and dry-run previews. Trigger: When user runs /flow-pr or wants to submit their work as a pull request.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "3.10"
---

# /flow-pr

Trigger: user runs `/flow-pr`

## Script Path

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-pr.mjs'))"
```

Store as `$SCRIPT`.

## User Contract

The user runs one command: `/flow-pr`. Promotion preparation, native review, lifecycle validation, and publication phases are internal agent orchestration and must not be exposed as extra user commands.

Always start with the safe preview:

```bash
node "$SCRIPT" --auto --dry-run
```

Read the JSON and improve only content supported by `changeSummary`. Its exact comparison range is the source of truth; never infer candidate scope from global or fallback Git history. The Jira comment is always built by the LLM.

When title or body overrides are derived from that preview, the first `planId` is discovery-only. Run a second canonical dry-run with the exact overrides, then publish with that second dry-run's `planId` and the same byte-identical override inputs. Never attempt publication with the discovery preview's `planId`.

## Task Branch Flow

Task branches preserve validation-only delivery. The runtime coordinates lifecycle gates and publication; never run a gate or push separately:

```bash
node "$SCRIPT" --auto --dry-run
node "$SCRIPT" --auto --expected-plan-id "<planId>"
```

When semantic overrides are needed, use this sequence instead:

```bash
node "$SCRIPT" --auto --dry-run
# Build title/body only from changeSummary, then write .flow-tmp/pr-body.md.
node "$SCRIPT" --auto --dry-run --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"
node "$SCRIPT" --auto --expected-plan-id "<override-planId>" --title-override "<title>" --pr-body-file ".flow-tmp/pr-body.md"
```

Reuse the same `flow-pr-agent` task session across discovery preview, canonical override preview, and publication. Intermediate phases return compact JSON only; they do not render PR-description or Jira-comment blocks.

`pre-push` runs after topology verification and immediately before push. `pre-pr` runs after push and before PR creation. If `pre-pr` denies, preserve the pushed branch and report `FLOW_RECOVERY_STATE`; never rewrite commits.

Oversized candidates require explicit validated `flow-chain-plan/v2`; feature plans bind original refs plus `expectedFinalTree`. Protected external `chainState` freezes every publication but is evidence, never review authorization. Every finalization invocation, including replay, freshly discovers and validates the current tracker authority at `pre-pr` and requires exact lineage/revision/receipt/gate/target agreement with journal evidence before readiness or reconciliation. Reconcile GitHub exactly once: complete an applied ambiguous effect only after fresh allow, preserve prerequisites for a draft retry, reject ready without matching journal, and noop an exact completed replay only after fresh validation. Child bases remain exact: keep parent branches until every descendant merges; delete them only afterward when retained historical metadata remains exact. `/flow-pr` never merges, retargets, or rewrites topology.

If the body needs improvement, write it under `.flow-tmp/`. Use the byte-identical file for the canonical override preview and publication, then remove it.

```bash
# After the canonical override preview and exact-plan publication:
rm -f .flow-tmp/pr-body.md && rmdir .flow-tmp 2>/dev/null || true
```

## Integration Promotion Flow

The runtime resolves integration and production branches dynamically. Resolution order is Git configuration (`flow.integrationBranch`, `flow.productionBranch`) followed by conventional aliases (`development`/`develop`, `main`/`master`). Never hardcode branch names in generated commands; use the JSON fields exactly.

### 1. Freeze Promotion Authority

```bash
node "$SCRIPT" --promotion-context --refresh
```

Require a clean integration branch exactly synchronized with `promotion.integrationRef`. The JSON freezes the canonical repository root, Git common directory, fetch/push origin identity, explicit GitHub repository destination, publication base, merge base, candidate commit/tree, changed paths/digest, and deterministic lineage. Stop on no-op, ambiguity, remote mismatch, or any repository identity change.

### 2. Resolve or Complete Exact Review

The parent `gentle-orchestrator` owns this loop; `flow-pr-agent` is the sole runtime/publication executor and never delegates reviewers. Invoke `--promotion-review` with one external coordinator-state file and follow exactly one returned `nextAction` at a time:

- `delegate_lens`: delegate the named reviewer once with its `executionKey`. `--lens-results-file` must contain one JSON array with entries exactly shaped as `{ "lens": "<returned lens>", "executionKey": "<returned executionKey>", "result": <reviewer JSON object> }`; never append raw reviewer JSON.
- `start_review`, `finalize_review`, `validate_receipt`: delegate execution to `flow-pr-agent` with the exact `coordinatorFingerprint` and action `executionKey`.
- `await_status`: re-read status only; never retry the ambiguous action.
- correction, recovery, maintainer action, scope change, malformed state, or `stop`: stop for the explicit decision; never guess, reopen, or start review at a lifecycle gate.
- `receipt_validated`: continue only when the same output contains `promotionPlanId`.

The external coordinator file is trusted local orchestration state, not cryptographic protection from a malicious local maintainer. Runtime still revalidates Git/native authority independently before repository mutation. Schema mismatch requires rerunning this loop from fresh external state.

For each reviewer result, read the complete lens-results array, append or update its wrapper while preserving the selected-lens ordered prefix, write the complete array to an adjacent temporary file, and atomically rename that temporary file over `--lens-results-file`. Only then re-run `--promotion-review`.

Pre-push and pre-PR validation must only validate existing authority. They must never start review.

Before preparation, resolve the initial `promotion` authority against `promotion.baseRef` and run:

```bash
node "$AUDIT_SCRIPT" --checks-only --no-pass-cache --base-ref "<promotion.baseRef>" --candidate-ref "<promotion.candidateRef>"
gentle-ai review validate --gate pre-pr --cwd "$(pwd)" --lineage "<promotion.lineage>" --base-ref "<promotion.baseRef>"
```

### 3. Prepare Without Publishing

Store state outside the repository:

```bash
STATE_FILE="$(node -e "const os=require('os'),path=require('path');process.stdout.write(path.join(os.tmpdir(),'flow-pr-promotion-'+process.pid+'.json'))")"
node "$SCRIPT" --prepare-promotion --refresh --state-file "$STATE_FILE" --coordinator-state-file "$COORDINATOR_STATE_FILE" --expected-promotion-plan-id "$PROMOTION_PLAN_ID"
```

Preparation may create a local release branch and version commit. It must not push, tag, or create a PR.

If `release` is present, resolve both reported authorities before publication:

- Bump authority: `release.baseRef` → `release.candidateRef`; validate `pre-push` and `pre-pr`.
- Aggregate production authority: `publication.baseRef` → `publication.candidateRef`; validate `pre-pr`.

Run candidate-scoped deterministic checks with `--no-pass-cache` for both exact boundaries. Publication requires `evidence.source: "fresh"` and `authoritative: true`; local cache evidence is advisory only. If semantic-release is active, `publication` is the original integration candidate and no bump authority exists.

### 4. Publish After Revalidation

```bash
node "$SCRIPT" --publish-promotion --state-file "$STATE_FILE" --coordinator-state-file "$COORDINATOR_STATE_FILE" --expected-promotion-plan-id "$PROMOTION_PLAN_ID"
```

Publication first revalidates the exact approved coordinator binding against refreshed remote Git and native authority, then reruns all validate-only gates and fresh deterministic checks before the first push, tag, or PR. For protected-development versioning it pushes the reviewed release branch, then verifies repository identity and the advertised remote release SHA immediately before each PR creation and readiness transition. Every `gh` call receives the frozen explicit repository destination.

Runtime PR topology:

- Bump PR: `release.candidateRef` → integration branch.
- Production PR: the same reviewed `release.candidateRef` → production branch.
- Semantic-release production PR: integration branch → production branch.

Both PRs are created as drafts. The runtime verifies each draft's state, head repository, head ref, exact `headRefOid`, and base before either becomes ready. Any integration, production, release, repository identity, or PR authority mismatch fails closed and closes every draft created by the attempt. A creation or readiness failure also closes all created PRs; never retry with guessed refs.

## What the Script Handles

- branch scanning and target resolution
- clean working tree enforcement
- push automation
- task PR creation
- dynamically resolved integration/production aliases
- exact native promotion, bump, and aggregate production authorities
- split preparation/publication with remote release SHA binding
- fresh-only publication evidence bound to repository, candidate, paths, and tool configuration
- explicit GitHub repository routing for every PR operation
- draft creation, post-create authority verification, atomic readiness, and failure cleanup
- version bump flow for protected integration branches
- merge-base aware comparison scope for PR summaries
- PR description generation
- safe override ingestion for title/body
- dry-run planning without side effects

## PR Semantics Rules

- Prefer meaningful reviewer-facing titles over mechanical `type: branch-slug` titles
- Good examples:
  - `fix(auth): tighten refresh token validation`
  - `refactor(storage): simplify S3 upload coordination`
  - `docs(api): clarify health and readiness behavior`
- Weak examples:
  - `feat:`
  - `fix: auth`
  - `chore: update stuff`
- Do NOT invent intent unsupported by the commits/files in the dry-run output
- Integration PRs remain release-style titles driven by the script

## Jira Comment — LLM builds it entirely (MANDATORY)

The script no longer generates a Jira comment. The LLM builds it 100% from the JSON output.

**Data sources** (extract from the dry-run/auto JSON):
- `branch` → Rama
- `baseBranch` + `prs[].target` → Destino
- `prs[].prUrl` → PR URL
- `prs[].title` → context for TYPE and feature title
- `prs[].action` → managed operation performed (`create`, `update`, or verified `noop`)
- `prs[].labels` → the single expected Flow-managed `type:*` label
- `changeSummary.commitCount` → Commits
- `changeSummary.changedFiles` + `changeSummary.fileStats` → technical scope
- `changeSummary.breakingChanges` → breaking-change evidence
- `changeSummary.deployment.hasMigrations` → Migraciones
- `changeSummary.impactArea` → Impacto
- `changeSummary.comparison` → exact base and `mergeBase..HEAD` range
- `integration` → determines TYPE (`FEATURE` vs `RELEASE`)

Do not infer these facts from `prDescription`, global logs, `HEAD~N`, or repository-wide history.

### Jira Comment Template

Use this structure every time. All sections are mandatory unless marked optional:

```markdown
### <TYPE>: <human-readable feature title>

<1-2 sentences explaining WHAT was built and WHY it matters to the business/user>

### Cambios técnicos
- <key technical change 1 — what it does, not just what file changed>
- <key technical change 2>
- <key technical change N>

### Bugs resueltos (opcional — incluir solo si hubo fixes no triviales)
- <bug description> → <how it was fixed>

### Cómo validar
- <concrete validation step 1>
- <concrete validation step 2>

### Evidencia
| Dato        | Valor                          |
| ----------- | ------------------------------ |
| Rama        | <branch>                       |
| Destino     | <target>                       |
| PR          | <URL>                          |
| Commits     | <N>                            |
| Migraciones | sí / no                        |
| Impacto     | <area — e.g. Financiero, Auth> |
```

### Template Rules

- **TYPE**: use `FEATURE`, `FIX`, `REFACTOR`, `CHORE`, or `DOCS` — match the dominant commit type
- **Feature title**: plain language, not the branch slug (e.g. "Push al vendedor cuando cliente cambia de estado", not "cliente-estado-notificaciones")
- **Cambios técnicos**: use only `changeSummary.changedFiles`, `changeSummary.fileStats`, and exact candidate commit evidence — describe the intent, not just the filename
- **Bugs resueltos**: include only non-trivial bugs found and fixed during the branch (e.g. ObjectDisposedException, race conditions, wrong API contracts) — omit section entirely if none
- **Cómo validar**: write concrete steps a QA or reviewer can follow, not generic instructions
- **Migraciones**: use `changeSummary.deployment.hasMigrations` — mark `sí` only when true
- **PR URL**: always use the real URL from `prs[].prUrl` — use `(pending — dry-run)` if not yet created

## Execution — No Narration Between Steps

Execute all steps silently. Do NOT narrate what you are about to do between steps.

- ❌ "Buen plan. Mejoro el título y el cuerpo del PR antes de ejecutar:"
- ❌ "Ahora ejecuto el comando real con los overrides:"
- ❌ "Voy a construir el Jira comment a partir del JSON:"
- ✅ Just run the next command. Present output only when there is a result to show.

The only time you speak between steps is when a **blocker or failure** requires user input.

## Output Contract

Every ordinary, hotfix, chain child, tracker, bump, and production PR result reports `action` and `labels`. Flow preserves non-`type:*` labels, replaces stale `type:*` labels with exactly one expected label, and verifies title, body, labels, repository, head, base, and OID after reconciliation. A missing expected repository label blocks the operation; Flow never creates labels.

When `--auto --dry-run` or `--auto` succeeds, present results in this order:

1. Concise execution summary (1–2 lines max)
2. PR URL(s) if created
3. PR title
4. Copy-paste Jira comment block (ALWAYS built by the LLM from the JSON)

Do not display the PR description in chat. The runtime still receives and verifies it through `--pr-body-file` when an override is used.

Use this emoji-free visual separator for copy-paste friendliness:

```text
─────────────────────────────────────────
JIRA COMMENT  (copy & paste to Jira)
─────────────────────────────────────────
```

Wrap only the Jira comment in a fenced code block so the user can copy it cleanly. Do not use emojis anywhere inside the Jira comment.

## Silent post-step: flow-playbook-sync

After `/flow-pr` succeeds, run a silent post-step for `flow-playbook-sync`.

Rules:

1. Check whether `.flow-skills/playbook-status.md` exists in the project root.
2. If it does **not** exist:
   - skip this step silently
   - do not mention playbook sync at all
3. If it **does** exist:
   - run the normal `flow-playbook-sync` flow as a follow-up step
   - keep it silent when no updates/proposals are detected
4. Only surface playbook-sync output when there is something actionable for the user.

When there are actionable proposals, append this after the PR/Jira output:

```text
💡 Playbook sync — se detectaron actualizaciones:
[mostrar propuestas resumidas para que el usuario las apruebe]
```

Do not treat playbook sync as part of PR creation success/failure. It is a follow-up sync step.

## Task PR vs Integration PR

- Task PRs (`feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`, `test/*`, `ci/*`, `spike/*`):
  - target dev branch
  - focus the summary on the branch-specific change
- Integration PRs (the runtime-resolved integration alias):
  - bump PR targets the resolved integration branch when a local version bump exists
  - production PR uses the reviewed release branch as head and the resolved production branch as target
  - semantic-release uses the integration branch as the production PR head
  - summarize the release batch from the frozen publication boundary
- Hotfix PRs:
  - preserve the script guardrails
  - if multiple PRs are created, show both URLs clearly

## Response Rules

- If the script succeeds, present the result concisely
- If a PR was created, return the URL clearly
- If dry-run was used, clearly label the result as a preview with no side effects
- Always surface the Jira comment in a clear copy-paste block — ALWAYS built by the LLM
- Never display the PR description block in chat
- Keep the Jira comment and its heading emoji-free
- After a successful PR flow, run the silent playbook-sync follow-up if the project supports it
- Only mention playbook-sync when it produced actionable proposals
- If the script fails, present the blocker/error and ask what action to take

## Primary Commands

### Automatic task-branch execution

```bash
node "$SCRIPT" --auto
```

### Safe rehearsal

```bash
node "$SCRIPT" --auto --dry-run
```

### Semantic override execution

```bash
node "$SCRIPT" --auto --title-override "fix(auth): tighten refresh token validation" --pr-body-file ".flow-tmp/pr-body.md"
# cleanup after run
rm -f .flow-tmp/pr-body.md && rmdir .flow-tmp 2>/dev/null || true
```

## Fallback / Debug Commands

Use these only for debugging or recovery, not as the normal path:

```bash
node "$SCRIPT" --scan
node "$SCRIPT" --check-cicd
node "$SCRIPT" --version-context
node "$SCRIPT" --release-guard --source "<resolved-integration>" --target "<resolved-production>" --is-clean true --version 1.2.3
node "$SCRIPT" --push
node "$SCRIPT" --create-pr --target "<resolved-target>" --title "feat: example" --body-file ".flow-tmp/body.md"
```

## Restrictions

- NEVER bypass the script's production guardrails
- NEVER omit or alter the dry-run `planId` for ordinary execution
- NEVER infer change facts outside `changeSummary` or its exact comparison range
- NEVER call `gh pr create` when `prs[].action` is `update` or `noop`; the runtime owns safe reconciliation
- NEVER rewrite incompatible reviewed-delivery commits; stop before push
- NEVER create or search GitHub Issues, install retired skills, or add `Closes`, `Fixes`, or `Resolves` linkage
- NEVER improvise chain branches, bases, SHAs, trees, work units, or recovery state
- NEVER ask the user to run internal promotion phases; `/flow-pr` remains one user command
- NEVER hardcode integration or production aliases; use runtime JSON fields
- NEVER start native review from pre-push, pre-PR, or publication validation
- NEVER create either integration PR until bump and aggregate authority validation has completed
- NEVER recreate the PR workflow manually if `--auto` can do it
- NEVER ask for confirmation on the happy path just because the script succeeded
- NEVER narrate between steps — execute silently, speak only on blockers
- NEVER pass `--jira-file` to the script — Jira comment is built entirely by the LLM
- NEVER omit the Jira comment from the output
- NEVER run tests from this skill; use `/flow-audit` if needed
- NEVER mention `flow-playbook-sync` when `.flow-skills/playbook-status.md` does not exist
- NEVER mention `flow-playbook-sync` when it produced no changes or proposals
