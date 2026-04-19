---
name: flow-pr
description: Push branch + create GitHub PR using the runtime script as the source of truth for automatic happy-path execution, production guardrails, and dry-run previews. Trigger: When user runs /flow-pr or wants to submit their work as a pull request.
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "3.2"
---

# /flow-pr

Trigger: user runs `/flow-pr`

## Script Path

```bash
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-pr.mjs'))"
```

Store as `$SCRIPT`.

## Default Behavior

The script is the source of truth and executor.

- Happy path: run `--auto`
- Safe preview: run `--auto --dry-run`
- Ask the user **only** if the script returns an actual blocker or failure

## LLM Presentation Contract

Use the script for planning/execution safety. Use the LLM to improve semantics when the dry-run output is too mechanical.

### Recommended staged flow

1. Run safe preview first:

```bash
node "$SCRIPT" --auto --dry-run
```

2. Read the JSON output and improve the human-facing content:
   - PR title (if the script-generated one is too mechanical)
   - PR description (if needed)
   - Jira comment (ALWAYS built by the LLM — see below)

3. If only the title needs improvement, pass it inline — no files needed:

```bash
node "$SCRIPT" --auto --title-override "fix(auth): tighten refresh token validation"
```

4. If the PR body also needs improvement, write it to `.flow-tmp/` (gitignored), then pass the path:

```bash
# 1. Write improved content with the Write tool:
#    .flow-tmp/pr-body.md   — improved PR description
# 2. Run with override:
node "$SCRIPT" --auto --title-override "fix(auth): tighten refresh token validation" --pr-body-file ".flow-tmp/pr-body.md"
# 3. Cleanup:
rm -f .flow-tmp/pr-body.md && rmdir .flow-tmp 2>/dev/null || true
```

## What the script handles

- branch scanning and target resolution
- clean working tree enforcement
- push automation
- task PR creation
- integration PR automation
- production release guardrails for `main` / `master`
- version bump flow for integration PRs
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
- `prDescription` → extract mentions of migrations, impact area, commit summaries
- `integration` → determines TYPE (`FEATURE` vs `RELEASE`)

### Jira Comment Template

Use this structure every time. All sections are mandatory unless marked optional:

```markdown
### 🚀 <TYPE>: <human-readable feature title>

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
- **Cambios técnicos**: extract from commits and changed files in the JSON output — describe the intent, not just the filename
- **Bugs resueltos**: include only non-trivial bugs found and fixed during the branch (e.g. ObjectDisposedException, race conditions, wrong API contracts) — omit section entirely if none
- **Cómo validar**: write concrete steps a QA or reviewer can follow, not generic instructions
- **Migraciones**: check `prDescription` from the JSON for mentions of migrations — mark `sí` if present, `no` otherwise
- **PR URL**: always use the real URL from `prs[].prUrl` — use `(pending — dry-run)` if not yet created

## Execution — No Narration Between Steps

Execute all steps silently. Do NOT narrate what you are about to do between steps.

- ❌ "Buen plan. Mejoro el título y el cuerpo del PR antes de ejecutar:"
- ❌ "Ahora ejecuto el comando real con los overrides:"
- ❌ "Voy a construir el Jira comment a partir del JSON:"
- ✅ Just run the next command. Present output only when there is a result to show.

The only time you speak between steps is when a **blocker or failure** requires user input.

## Output Contract

When `--auto --dry-run` or `--auto` succeeds, present results in this order:

1. Concise execution summary (1–2 lines max)
2. PR URL(s) if created
3. PR title
4. Copy-paste PR description block
5. Copy-paste Jira comment block (ALWAYS built by the LLM from the JSON)

Use these visual separators for copy-paste friendliness:

```text
─────────────────────────────────────────
📋 PR DESCRIPTION  (copy & paste to GitHub)
─────────────────────────────────────────
```

```text
─────────────────────────────────────────
💬 JIRA COMMENT  (copy & paste to Jira)
─────────────────────────────────────────
```

Wrap PR description and Jira comment in fenced code blocks so the user can copy them cleanly.

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
- Integration PRs (`develop` / `development`):
  - target prod branch
  - summarize the release batch from the real branch divergence scope
  - include version bump context in the summary
- Hotfix PRs:
  - preserve the script guardrails
  - if multiple PRs are created, show both URLs clearly

## Response Rules

- If the script succeeds, present the result concisely
- If a PR was created, return the URL clearly
- If dry-run was used, clearly label the result as a preview with no side effects
- Always surface the Jira comment in a clear copy-paste block — ALWAYS built by the LLM
- After a successful PR flow, run the silent playbook-sync follow-up if the project supports it
- Only mention playbook-sync when it produced actionable proposals
- If the script fails, present the blocker/error and ask what action to take

## Primary Commands

### Automatic execution

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
node "$SCRIPT" --release-guard --source development --target main --is-clean true --version 1.2.3
node "$SCRIPT" --push
node "$SCRIPT" --create-pr --target development --title "feat: example" --body-file ".flow-tmp/body.md"
```

## Restrictions

- NEVER bypass the script's production guardrails
- NEVER recreate the PR workflow manually if `--auto` can do it
- NEVER ask for confirmation on the happy path just because the script succeeded
- NEVER narrate between steps — execute silently, speak only on blockers
- NEVER pass `--jira-file` to the script — Jira comment is built entirely by the LLM
- NEVER omit the Jira comment from the output
- NEVER run tests from this skill; use `/flow-audit` if needed
- NEVER mention `flow-playbook-sync` when `.flow-skills/playbook-status.md` does not exist
- NEVER mention `flow-playbook-sync` when it produced no changes or proposals
