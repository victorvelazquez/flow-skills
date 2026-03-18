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
cd C:/Users/victor/Developer/Tools/flow-skills
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

Export, review, commit, push.

**Step A1 — Export from opencode → repo:**

```bash
cd C:/Users/victor/Developer/Tools/flow-skills
node install.mjs --export
```

Show the output. If "No files changed" → done.

**Step A2 — Review what changed:**

```bash
git diff --stat
```

Ask the user: "Which files do you want to include in this commit?" If they say all, proceed. If selective, stage only specified files.

**Step A3 — Stage files:**

```bash
# Stage all changes:
git add -A

# Or selectively (if user specified):
git add <file1> <file2> ...
```

**Step A4 — Generate commit message and commit:**

Analyze the staged changes and generate a semantic commit message following Conventional Commits:

- `feat(flow-X):` for new features or skills
- `fix(flow-X):` for bug fixes
- `docs:` for README/CHANGELOG only
- `chore:` for install.mjs or tooling changes
- `refactor(flow-X):` for internal rewrites

Present the message to the user for approval before committing:

```bash
git commit -m "<generated message>"
```

**Step A5 — Push:**

```bash
git push
```

Report the result with the commit hash and remote URL.

---

### Mode B — Update this machine from repo

Pull latest and reinstall.

**Step B1 — Pull:**

```bash
cd C:/Users/victor/Developer/Tools/flow-skills
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

- The repo lives at `C:/Users/victor/Developer/Tools/flow-skills/` on Victor's machine.
- Remote: `https://github.com/victorvelazquez/flow-skills.git`
- Always run `node install.mjs --dry-run` first if the user wants to preview changes before installing.
- After installing, restart OpenCode for the skills to take effect.
