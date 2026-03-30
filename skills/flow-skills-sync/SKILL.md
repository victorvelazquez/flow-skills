# flow-skills-sync — Skill Manager

## Description

Manages the `flow-skills` repository: publish local changes, update your machine, or install from scratch. Detects context automatically and offers the right action.

## Trigger

When the user invokes `/flow-skills-sync` or asks to publish, update, or install flow skills.

---

## Workflow

**Script paths — resolve once before starting:**

```bash
SCRIPT=$(node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-pr.mjs'))")
FS_SCRIPT=$(node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-skills.mjs'))")
```

`$SCRIPT` is used in Mode A for versioning (version bump only). `$FS_SCRIPT` is used in Steps 1, Mode A (A1–A2), and Mode B.

### Step 1 — Detect context

Run:

```bash
node "$FS_SCRIPT" --context
```

Store the full JSON output as `CONTEXT_JSON`. Read the `mode` field:

| `mode` value | Action                                                           |
| ------------ | ---------------------------------------------------------------- |
| `"publish"`  | Proceed to Mode A                                                |
| `"update"`   | Proceed to Mode B                                                |
| `"install"`  | Proceed to Mode C                                                |
| `"synced"`   | Report "✅ Everything is up to date. No action needed." and stop |

If the user explicitly requests a different mode than detected, honor their request.

**`CONTEXT_JSON` is available throughout Mode A** — do not call `--context` again.

---

### Mode A — Publish local changes to repo

Export, version bump, CHANGELOG, release branch, PR.

**Step A1 — Export from opencode → repo:**

> ⚠️ Write operation — call EXACTLY ONCE. Do not call `--run-export` again in this workflow.

```bash
node "$FS_SCRIPT" --run-export
```

Show the `count` and `files` from the JSON result.

**Step A2 — Collect changed files:**

Read `json.files` from the `--run-export` response. Store as `EXPORT_FILES` (array of relative repo paths).

If `json.nothing === true` → **abort**:

> ❌ Nothing to publish. No skill files have changed since the last export.
> Make changes in OpenCode first, then re-run /flow-skills-sync → Publish.

For subsequent references to changed files (e.g. in the confirmation panel), use `git diff --name-only` — do NOT call `--run-export` again.

**Step A3 — Read release context (from Step 1 CONTEXT_JSON):**

Context was already gathered in Step 1. Read these fields from `CONTEXT_JSON`:

- `git.branch` — current branch name
- `git.hasOrigin` — remote configured? (boolean)
- `git.remoteUrl` — origin remote URL (for reference)
- `version.current` — e.g. `"0.0.1"`
- `version.lastTag` — e.g. `"v0.0.1"`
- `version.commitsSinceTag` — array of commit messages since last tag

**Pre-flight checks — abort if:**

- `git.branch !== 'main'` → abort:
  > ❌ Publish must run from main. Current branch: {git.branch}.
  > Run: git checkout main
- `git.hasOrigin === false` → abort:
  > ❌ No remote origin configured. Cannot push release branch.

**Step A4 — Determine bump type:**

Analyze `version.commitsSinceTag` from `CONTEXT_JSON`.

> 💡 `version.suggestedBump` from `CONTEXT_JSON` is a **hint based on commit message prefix patterns**. You MUST analyze the commit messages semantically before accepting or overriding it. A commit like `"chore: add new flow-docs-sync skill"` may warrant MINOR even without a `feat:` prefix.

| Signals                                            | Bump  |
| -------------------------------------------------- | ----- |
| `BREAKING CHANGE`, `!` after type, removed exports | MAJOR |
| `feat(...)`, new skills/commands, new capabilities | MINOR |
| `fix(...)`, `chore(...)`, `docs:`, `refactor(...)` | PATCH |

If the suggested bump matches your analysis → accept `version.suggestedBump` directly.
If you override the bump → recalculate `version` and `prUrl` (replace version segment in the stored `prUrl` string).

**Step A5 — Calculate new version:**

If bump type was accepted from `version.suggestedBump`: use `version.suggestedVersion` directly.
If bump type was overridden: parse `version.current` (X.Y.Z) and apply bump → new version string.

**Step A6 — Generate CHANGELOG entry:**

Write a new entry in Keep a Changelog format. Prepend it after the `## [Unreleased]` line in `CHANGELOG.md` (or at the top if no Unreleased section exists):

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

Include only sections that have content. Date: today (YYYY-MM-DD).

**Step A7 — Bump version in package.json:**

```bash
node "$SCRIPT" --update-version --version X.Y.Z
```

**Step A8 — Confirmation panel:**

Show this panel and wait for user approval before proceeding:

```
╔══════════════════════════════════════════════════════╗
║          flow-skills-sync — Publish Release          ║
╠══════════════════════════════════════════════════════╣
║  Version:  {current}  →  {new}  ({BUMP_TYPE})        ║
║  Branch:   main  (version commit goes here)          ║
║  Tag:      v{new}  (created by CI/CD after merge)    ║
║  Date:     {YYYY-MM-DD}                              ║
╠══════════════════════════════════════════════════════╣
║  Files to commit:                                    ║
║    package.json                                      ║
║    CHANGELOG.md                                      ║
║    {each file from EXPORT_FILES, one per line}       ║
╠══════════════════════════════════════════════════════╣
║  CHANGELOG preview:                                  ║
║    {first 4 lines of the generated entry}            ║
╠══════════════════════════════════════════════════════╣
║  Git actions:                                        ║
║    git add <files>                                   ║
║    git commit "chore(release): bump version to {new}"║
║    git push origin main                              ║
╚══════════════════════════════════════════════════════╝
Proceed? (yes / no)
```

If the user says no → abort. No files have been changed yet.

**Step A9 — Commit the version bump:**

Build the `--files` argument: `package.json` and `CHANGELOG.md` always come first, followed by all files from `EXPORT_FILES` joined with commas.

```bash
node "$SCRIPT" --commit-version --version X.Y.Z \
  --files "package.json,CHANGELOG.md,{EXPORT_FILES comma-joined}"
```

Parse the JSON result. Check each `step.ok`. If any step failed, show the failure and stop.

**Step A10 — Push and summary:**

```bash
git push origin main
```

If push fails due to branch protection, the flow-skills repo uses `main` directly. If protected, open a PR manually.

```
Release v{new} committed on main.
  Updated: {files}  |  Commit: chore(release): bump version to {new}
  🏷️  Tag v{new} will be created by CI/CD after the commit is on main.
```

**Step A8 — Confirmation panel:**

Show this panel and wait for user approval before proceeding:

```
╔══════════════════════════════════════════════════════╗
║          flow-skills-sync — Publish Release          ║
╠══════════════════════════════════════════════════════╣
║  Version:  {current}  →  {new}  ({BUMP_TYPE})        ║
║  Branch:   release/v{new}  (will be created)         ║
║  Tag:      v{new}                                    ║
║  Date:     {YYYY-MM-DD}                              ║
╠══════════════════════════════════════════════════════╣
║  Files to commit:                                    ║
║    package.json                                      ║
║    CHANGELOG.md                                      ║
║    {each file from EXPORT_FILES, one per line}       ║
╠══════════════════════════════════════════════════════╣
║  CHANGELOG preview:                                  ║
║    {first 4 lines of the generated entry}            ║
╠══════════════════════════════════════════════════════╣
║  Git actions:                                        ║
║    git add <files>                                   ║
║    git commit "chore(release): bump version to {new}"║
║    git tag -a v{new}                                 ║
║    git push origin release/v{new}                   ║
║    git push origin v{new}                            ║
╚══════════════════════════════════════════════════════╝
Proceed? (yes / no)
```

If the user says no → abort. No branch has been created yet.

**Step A9 — Create release branch:**

```bash
git checkout -b release/vX.Y.Z
```

**Step A10 — Execute release:**

Build the `--files` argument: `package.json` and `CHANGELOG.md` always come first, followed by all files from `EXPORT_FILES` joined with commas.

```bash
node "$SCRIPT" --execute --version X.Y.Z \
  --files "package.json,CHANGELOG.md,{EXPORT_FILES comma-joined}"
```

Parse the JSON result. Check each `step.ok`. If any step failed, show the failure and stop.

If the `git-tag` step fails with "tag already exists":

> ❌ Tag v{version} already exists. To fix:
> git tag -d v{version} && git push origin --delete v{version}
> Then re-run Publish to try again.

**Step A11 — PR instruction:**

Use `prUrl` from `CONTEXT_JSON` directly. If you overrode the version in Step A4/A5, substitute the version segment: replace `release/v{suggestedVersion}` with `release/v{actualVersion}` in the stored `prUrl` string.

```
Release v{new} prepared on branch release/v{new}.
  Updated: {files}  |  Commit: chore(release): bump version to {new}
  Tag: v{new}  |  Branch: release/v{new} pushed to origin
  ⚠️  Open a PR: release/v{new} → main
  {prUrl}
```

---

### Mode B — Update this machine from repo

Pull latest and reinstall.

**Step B1 — Pull and install:**

```bash
node "$FS_SCRIPT" --update
```

Read the JSON result:

- If `json.ok === true`:
  Show `json.pull.output` (commits pulled / "Already up to date.").
  ✅ Update complete. Restart OpenCode to load the updated skills.
- If `json.ok === false` and `json.pull.ok === false`:
  ❌ git pull failed. Details: `json.pull.output`
  Resolve the conflict or network issue, then re-run.
- If `json.ok === false` and `json.pull.ok === true` and `json.install.ok === false`:
  ❌ git pull succeeded but install failed. Details: `json.install.output`

---

### Mode C — Install from scratch (new machine)

```bash
git clone https://github.com/victorvelazquez/flow-skills.git ~/Developer/Tools/flow-skills
cd ~/Developer/Tools/flow-skills
node install.mjs
```

Adapt the clone path to the user's OS if needed.

---

## Notes

- The repo lives wherever you cloned it. The canonical remote is `https://github.com/victorvelazquez/flow-skills.git`.
- Remote: `https://github.com/victorvelazquez/flow-skills.git`
- Always run `node install.mjs --dry-run` first if the user wants to preview changes before installing.
- After installing, restart OpenCode for the skills to take effect.
