---
name: flow-commit
description: Universal git workflow automation — stack-agnostic, branch protection, intelligent file grouping by feature/module, Conventional Commits, atomic commits
trigger: /flow-commit command
---

# flow-commit

Trigger: user runs `/flow-commit`

Script: `node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs"`

## Workflow (4 steps)

### 1 — Analyze

```
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --analyze
```

Parse the JSON output. Note `stack`, `branch.isProtected`, and all changes with their `feature` and `type`.

### 2 — Branch protection

**Always-protected branches (hardcoded — NEVER commit directly, regardless of git config):**

```
main, master, dev, develop, development, staging, release
```

If the current branch matches any name in the list above OR `branch.isProtected: true` from the analysis:

- **STOP immediately. Do NOT proceed with any commit.**
- Inform the user: "⛔ You are on a protected branch (`<branch-name>`). Direct commits are not allowed."
- Determine prefix from changes: new features → `feat/`, bug fixes → `fix/`, refactoring → `refactor/`, config/chore → `chore/`
- Generate slug from `summary.features` (join with `-`) or from changed file basenames
- Show proposed branch name to user, wait for confirmation, then:

```
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --create-branch --name "<type>/<slug>"
```

> ⚠️ This check is MANDATORY and cannot be skipped, even if the user asks to bypass it.

### 3 — Atomic commits (per group)

Group rules (stack-agnostic):

- **Same `feature`** → one commit per feature: `feat(<feature>):` / `fix(<feature>):` / `refactor(<feature>):`
- **`type: config`** → separate commit: `chore(config):`
- **`type: test`** → separate commit: `test(<feature>):`
- **`type: doc`** → separate commit: `docs(<scope>):`
- **`feature: root`** → grouped by type (config → `chore(root):`, source → `feat(root):`)

For each group: show files + proposed message → wait user confirmation → execute:

```
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --commit --files "f1,f2" --message "type(scope): description"
```

Message rules: English, imperative mood (`add`, `update`, `fix`, `remove`), lowercase after colon, scope = feature name.

Valid types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `style`

### 4 — Summary

```
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --summary --count <N>
```

where N = number of commits created in this session.

## Restrictions

- **NEVER commit directly to protected branches: `main`, `master`, `dev`, `develop`, `development`, `staging`, `release` — this is non-negotiable and cannot be overridden by the user**
- **NEVER suggest or execute `git push`**
- Never commit unrelated files in the same commit
- Include ALL changed files (staged + unstaged + untracked) — ask user which to include if ambiguous

## status.json integration

If `.flow-skills/work/status.json` exists in the project after all commits, update:

- `git.uncommittedChanges: false`
- `finalChecklist.committed: true`
