# flow-skills — Skill Manager

## Description

Manages the `flow-skills` repository: publish local changes, update your machine, or install from scratch. Detects context automatically and offers the right action.

## Trigger

When the user invokes `/flow-skills` or asks to publish, update, or install flow skills.

---

## Workflow

### Step 1 — Detect context

Check the current state of the repo:

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$REPO_ROOT"
git status --short
```

Based on the output, determine which mode applies:

| Situation                          | Recommended mode                  |
| ---------------------------------- | --------------------------------- |
| Local opencode skills have changed | **Publish**                       |
| Remote has new commits             | **Update**                        |
| First time on this machine         | **Install from scratch**          |
| All in sync                        | Report "everything is up to date" |

Ask the user which mode they want if context is ambiguous.

---

### Mode A — Publish local changes to repo

Export, version bump, CHANGELOG, release branch, PR.

**Script path — resolve once and store as `$SCRIPT`:**

```bash
SCRIPT=$(node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-release.mjs'))")
```

**Step A1 — Export from opencode → repo:**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$REPO_ROOT"
node install.mjs --export
```

Show the output.

**Step A2 — Collect changed files:**

Collect all lines from the export output that start with `  exported: ` (two spaces then `exported: `).
Strip the prefix to get bare file paths. Store as `EXPORT_FILES` (list of paths).

If `EXPORT_FILES` is empty → **abort**:
> ❌ Nothing to publish. No skill files have changed since the last export.
>    Make changes in OpenCode first, then re-run /flow-skills → Publish.

**Step A3 — Gather context:**

```bash
node "$SCRIPT" --context
```

Parse the JSON output. Extract:
- `git.branch` — current branch
- `git.hasOrigin` — remote configured?
- `git.remoteUrl` — origin remote URL (for PR link)
- `version.current` — e.g. `"0.0.1"`
- `version.lastTag` — e.g. `"v0.0.1"`
- `commits.log` — commit list since last tag

**Pre-flight checks — abort if:**

- `git.branch !== 'main'` → abort:
  > ❌ Publish must run from main. Current branch: {branch}.
  >    Run: git checkout main
- `git.hasOrigin` is false → abort:
  > ❌ No remote origin configured. Cannot push release branch.

**Step A4 — Determine bump type:**

Analyze `commits.log`. Priority: BREAKING → MAJOR · FEATURE → MINOR · else → PATCH.

| Signals | Bump |
|---------|------|
| `BREAKING CHANGE`, `!` after type, removed exports | MAJOR |
| `feat(...)`, new skills/commands | MINOR |
| `fix(...)`, `chore(...)`, `docs:`, `refactor(...)` | PATCH |

**Step A5 — Calculate new version:**

Parse `version.current` (X.Y.Z). Apply bump → new version string `X.Y.Z`.

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
║              flow-skills — Publish Release           ║
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
>    git tag -d v{version} && git push origin --delete v{version}
>    Then re-run Publish to try again.

**Step A11 — PR instruction:**

Parse `owner` and `repo` from `git.remoteUrl` in the `--context` JSON output. Handle both SSH (`git@github.com:owner/repo.git`) and HTTPS (`https://github.com/owner/repo.git`) formats.

```
Release v{new} prepared on branch release/v{new}.
  Updated: {files}  |  Commit: chore(release): bump version to {new}
  Tag: v{new}  |  Branch: release/v{new} pushed to origin
  ⚠️  Open a PR: release/v{new} → main
  https://github.com/{owner}/{repo}/compare/release/v{new}?expand=1
```

---

### Mode B — Update this machine from repo

Pull latest and reinstall.

**Step B1 — Pull:**

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
cd "$REPO_ROOT"
git pull
```

Show what changed (commits pulled).

**Step B2 — Install:**

```bash
node install.mjs
```

Show the output. Remind the user to restart OpenCode to load the updated skills.

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
