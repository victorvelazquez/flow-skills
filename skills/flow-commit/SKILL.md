---
name: flow-commit
description: Universal git commit workflow — uses the runtime script as the source of truth for automatic commits, protected-branch handling, and dry-run previews. Trigger: /flow-commit command.
trigger: /flow-commit command
license: Apache-2.0
metadata:
  author: Victor Velazquez
  version: "1.0"
---

# flow-commit

## Execution Flow

The script is the source of truth. Always run `--auto --dry-run` first, then execute with overrides.

1. Run `--auto --dry-run` — get the plan
2. Read `plannedCommitGroups[].files` and compare against `git status --short`
3. If user mentioned specific files, verify they appear in the plan — if missing, ask before proceeding
4. Apply LLM-chosen branch name and messages, then run `--auto` with overrides
5. If there is a mismatch between the plan and the working tree, STOP and clarify

## Naming

Use the LLM to determine the final branch name and commit messages from the dry-run plan:

- One short branch name with a conventional prefix: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `test/`
- One commit message per planned group — concise, why-oriented, conventional format
- Do NOT invent scope or intent not supported by the script-reported files
- Treat the LLM-chosen values as final — never narrate or compare them to script defaults

Good vs bad messages:

- ✅ `fix(auth): tighten refresh token validation`
- ❌ `fix(auth): fix auth issues`
- ✅ `refactor(storage): simplify S3 upload coordination`
- ❌ `refactor(storage): refactor storage module`

Pass final values to the script via:

- `--branch-name "type/slug"`
- `--message-overrides '{"group:key":"type(scope): message"}'`

Message override keys come from `plannedCommitGroups[].key` in the script JSON.

## Signals

- `skippedCommitGroups` — groups skipped because no effective staged changes remained; usually safe and expected
- `leftovers.known` non-empty — files from the original scope were not committed; needs attention
- `leftovers.artifacts` non-empty — new files appeared outside the original scope; warn, do not assume they belong in this session
- `leftovers.known = []` and `leftovers.artifacts = []` — flow finished cleanly

## Commands

### Normal flow

```bash
# Step 1 — preview
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --auto --dry-run

# Step 2 — execute with LLM overrides
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --auto --branch-name "fix/auth-refresh-token" --message-overrides '{"source:auth":"fix(auth): tighten refresh token validation"}'
```

### Fallback / debug

```bash
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --analyze
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --summary --count 5
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --create-branch --name "feat/example"
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --commit --files "f1,f2" --message "feat(scope): add example"
```

## Response Rules

### Happy path (script succeeds, no leftovers)

Present exactly this format — nothing more, nothing less:

```
Todo limpio. Resumen:
- ✅ Branch creado: <branch> (desde <base-branch>, que es rama protegida)
- ✅ Commit: <message>
- ✅ <N> archivo(s): <file(s)>
- ✅ Working tree limpio: sin leftovers

Ejecutá /flow-pr para pushear y crear el PR.
```

- Omit the "rama protegida" note if the base branch is not protected
- List each file on a separate `✅` line if there are multiple files in a single commit
- If there are multiple commits, add one `✅ Commit:` line per commit followed by its files

### Other cases

- If dry-run was used, label the result clearly as a preview with no side effects
- If the script fails, present the error and ask what action to take
- If skipped commit groups are reported, explain they were skipped intentionally and safely
- If leftovers remain, list them explicitly and ask whether they should be included
- If any user-mentioned or `git status` file is absent from the plan, do not present the run as complete without clarifying the mismatch

## Restrictions

- NEVER push from this skill
- NEVER ask for confirmation on the happy path just because the script succeeded
