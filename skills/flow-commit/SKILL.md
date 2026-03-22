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

### 1b — Completeness check (MANDATORY)

After parsing the analysis, verify no files are missing before proposing commit groups.
Use the best available source of truth — in order of priority:

**Priority 1 — SDD artifacts (if SDD is active in the project)**

- Search Engram for `sdd/{change}/design` or `sdd/{change}/apply-progress`
- Or read `openspec/changes/*/tasks.md` if openspec mode is used
- Cross-check the "Files Created/Modified" list against `staged + unstaged + untracked` from `--analyze`

**Priority 2 — User-provided file list (if user mentioned specific files)**

- If the user said "I also changed X" or "don't forget Y", add those files to the list
- Cross-check them against `--analyze` output

**Priority 3 — git status fallback (always applicable)**

- Run: `git status --short`
- Compare the full output against what `--analyze` reported
- Flag any file in `git status` that is NOT already present in the `--analyze` JSON

**In all cases:**

- Flag any file that appears in the source of truth but is absent from `--analyze`
- Show the flagged files to the user and ask: "These files were not detected by the analyzer — should they be included?"
- Never silently drop files

> ⚠️ Do NOT skip this step. Missing a file means it goes uncommitted silently, requiring a follow-up commit session.

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

### 4 — Summary + semi-automatic leftover detection

After all commits, run summary passing the full known-files set from Step 1:

```
node "$(node -e "process.stdout.write(require('os').homedir())")/.config/opencode/scripts/flow-commit.mjs" --summary --count <N> --known-files "f1,f2,f3,..."
```

where N = number of commits created in this session, and `--known-files` = ALL file paths from the original `--analyze` output (staged + unstaged + untracked + deleted), comma-separated.

**Parse the `__LEFTOVER__:` line** from the output — it contains:

```json
{
  "known": ["files still uncommitted from original scope"],
  "artifacts": ["new files NOT in original scope"]
}
```

**Semi-automatic loop rules (max 3 rounds):**

| `known` array | `artifacts` array | Action                                                                                                                                   |
| ------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| empty         | empty             | ✅ Done — working tree is clean                                                                                                          |
| non-empty     | any               | Re-run `--analyze --known-files "..."` with the leftover known files, propose next commit group, **wait user confirmation**, then commit |
| empty         | non-empty         | ⚠️ Warn only — artifact guard triggered, do NOT commit these files                                                                       |

**Loop safety guarantees:**

- Max 3 re-scan rounds — exit with warning if still not clean after round 3
- Only files from the **original known-files set** can enter a new commit round
- If after a commit round the `known` leftovers are identical to the previous round → exit (no progress, something is blocking)
- Never auto-commit without user confirmation

## Restrictions

- **NEVER commit directly to protected branches: `main`, `master`, `dev`, `develop`, `development`, `staging`, `release` — this is non-negotiable and cannot be overridden by the user**
- **NEVER suggest or execute `git push`**
- Never commit unrelated files in the same commit
- Include ALL changed files (staged + unstaged + untracked) — ask user which to include if ambiguous
- **ALWAYS run the completeness check (Step 1b)** — use SDD artifacts if available, otherwise fall back to user-provided file lists or plain `git status`. Never rely solely on `--analyze` output.
- **ALWAYS pass `--known-files` to `--summary`** using the full file list from the initial `--analyze`

## status.json integration

If `.flow-skills/work/status.json` exists in the project after all commits, update:

- `git.uncommittedChanges: false`
- `finalChecklist.committed: true`
