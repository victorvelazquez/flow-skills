---
name: flow-pr
description: Push branch + create GitHub PR using the runtime script as the source of truth for automatic happy-path execution, production guardrails, and dry-run previews. Trigger: When user runs /flow-pr or wants to submit their work as a pull request.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "3.1"
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

Use the script for planning/execution safety, and use the LLM to improve semantics when the dry-run output is too mechanical.

### Recommended staged flow

1. Run safe preview first:

```bash
node "$SCRIPT" --auto --dry-run
```

2. Read the JSON preview and improve only the human-facing content when useful:
   - PR title
   - PR description
   - Jira comment

3. If the script-generated title/body/jira are already good enough, run the real command unchanged.

4. If better semantics are needed, pass safe overrides back into the script:

```bash
node "$SCRIPT" --auto --title-override "fix(auth): tighten refresh token validation" --pr-body-file "/tmp/pr-body.md" --jira-file "/tmp/jira-comment.md"
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
- Jira comment generation
- safe override ingestion for title/body/jira
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

## Output Contract

When `--auto --dry-run` or `--auto` succeeds, present results in this order when relevant:

1. concise execution summary
2. PR URL(s) if created
3. PR title preview
4. copy-paste PR description block
5. copy-paste Jira comment block

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
- Always surface the Jira comment again in a clear copy-paste block
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
node "$SCRIPT" --auto --title-override "fix(auth): tighten refresh token validation" --pr-body-file "/tmp/pr-body.md" --jira-file "/tmp/jira-comment.md"
```

## Fallback / Debug Commands

Use these only for debugging or recovery, not as the normal path:

```bash
node "$SCRIPT" --scan
node "$SCRIPT" --check-cicd
node "$SCRIPT" --version-context
node "$SCRIPT" --release-guard --source development --target main --is-clean true --version 1.2.3
node "$SCRIPT" --push
node "$SCRIPT" --create-pr --target development --title "feat: example" --body-file "body.md"
```

## Restrictions

- NEVER bypass the script’s production guardrails
- NEVER recreate the PR workflow manually if `--auto` can do it
- NEVER ask for confirmation on the happy path just because the script succeeded
- NEVER hide the Jira comment when the script generated one
- NEVER run tests from this skill; use `/flow-audit` if needed
- NEVER mention `flow-playbook-sync` when `.flow-skills/playbook-status.md` does not exist
- NEVER mention `flow-playbook-sync` when it produced no changes or proposals
