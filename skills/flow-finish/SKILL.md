---
name: flow-finish
description: Generate professional PR Description + Jira Comment by analyzing the current branch, with optional git push.
trigger: /flow-finish command
---

# /flow-finish

> Generates PR Description + Jira Comment using AI analysis of commits, files, and SDD context. Optionally pushes the branch.

## Script Path

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-finish.mjs'))"
```

Store as `$SCRIPT`. Use in all commands below.

---

## Workflow

### Stage 1 — Pre-checks

```
node "$SCRIPT" --pre-checks
```

- `isProtectedBranch: true` → **abort** with message from `errors[]`
- `isClean: false` → **warn**: "uncommitted files — run /flow-commit first"
- Display `currentBranch`

### Stage 2 — Git Context

```
node "$SCRIPT" --context
```

Parse: `branch`, `platform`, `commits`, `totalCommits`, `commitHashesSummary`, `fileStats`, `filesByCategory`, `topFiles`, `hasBreakingChanges`, `breakingCommits`, `deployment`, `impactArea`, `baseBranch`.

### Stage 3 — SDD Context (optional)

If user mentions an active SDD change:

```
mem_search(query: "sdd/<change>/proposal") → mem_get_observation(id)
mem_search(query: "sdd/<change>/tasks") → mem_get_observation(id)
```

Extract: objective, completed tasks, story points. Enrich Stage 4.

### Stage 4 — Generate PR Description + Jira Comment

Use all context from Stages 2–3. Output in this exact order:

1. A plain-text visual separator line
2. The PR Description block (4-backtick fence)
3. A plain-text visual separator line
4. The Jira Comment block (4-backtick fence)

---

**Visual separators** (plain text, outside any fence):

Before PR Description:

```
─────────────────────────────────────────
📋 PR DESCRIPTION  (copy & paste to GitHub)
─────────────────────────────────────────
```

Before Jira Comment:

```
─────────────────────────────────────────
💬 JIRA COMMENT  (copiar y pegar en Jira)
─────────────────────────────────────────
```

---

**Wrapper rule**: each content block uses exactly 4 backticks as the outer fence. Content inside may contain triple-backtick code blocks — that is why 4 backticks are required.

---

**PR Description block** — language: English — audience: code reviewers

Typography rules:

- No H1. Use `##` for main sections (max 5). Use `###` only when a section has distinct subsections (rare).
- Emojis in section headers: optional, consistent if used. Never in bullet content.
- Total length: 150–350 words. Cut aggressively if over 400.
- Internal code blocks: use normal ` ``` ` fences.

Sections in order:

1. `## Summary` — 2-3 sentences: what changed, why it matters. Include branch name and rough file count inline.
2. `## Changes` — 3-7 bullets from commits. Group related commits. Omit merge commits and chore bumps.
3. `## Testing` — 3-5 numbered steps a reviewer can follow to verify the change. Include a test command if applicable.
4. `## Checklist` — 4-6 checkboxes covering: tests added/updated · no new console warnings · breaking change (y/n) · env variable change (y/n) · migration required (y/n).
5. `## Breaking Changes` — only if `hasBreakingChanges: true`. 1-3 bullets: what breaks and migration path.
6. `## Deployment Notes` — only if `deployment.showDeploymentNotes`. 2-3 bullets.

Do NOT include: standalone Security / Performance / Observability sections, metrics tables (redundant with GitHub diff), or Impact Area as a standalone section. Absorb relevant notes into Summary or Checklist.

---

**Jira Comment block** — language: Spanish — audience: QA, PM, stakeholders

Typography rules:

- Use `###` as the maximum heading level (Jira comment context).
- Emojis encouraged for scannability.
- Total length: ≤200 words in narrative content.
- No technical implementation details (class names, method names, interceptor types, etc.).
- Business/QA tone: what business problem does this solve, how to validate it.

Sections in order:

1. `### 🚀 <TIPO>: <titulo>` — header line (TIPO in uppercase: FEAT, FIX, REFACTOR, etc.)
2. Bold paragraph (no heading): max 2 sentences. What business problem does this solve? What can the user now do?
3. `### ✅ Cómo validar` — 3-5 numbered steps written for a non-developer. Describe UI interactions, not code.
4. `### 📋 Evidencia` — compact 2-column table with rows: PR, Branch, Commits, Archivos modificados, Story Points, Estado.
5. Optional one-line deployment note if `deployment.showDeploymentNotes` (plain text, no heading).

### Stage 5 — Push (optional)

Show: branch, N commits, remote. **Ask for explicit confirmation.**

If confirmed:

```
node "$SCRIPT" --push
```

If `success: false`: show `error` + suggest `git pull origin <branch> --rebase` and `git push -u origin <branch>`.

---

## Restrictions

- NEVER push without explicit user confirmation
- NEVER run tests — use /flow-audit for that
- NEVER touch `analytics.jsonl` or `.flow-skills/` state files
- NEVER commit any changes
- Check Engram for recent /flow-audit run (informational only, not blocking)
