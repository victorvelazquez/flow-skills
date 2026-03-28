---
name: flow-pr
description: >
  Push branch + create GitHub PR automatically with AI-generated PR Description and Jira Comment.
  Trigger: When user runs /flow-pr or wants to submit their work as a pull request.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "2.1"
---

# /flow-pr

> Push branch → create PR on GitHub → AI-generated PR Description + Jira Comment ready to paste.
> For integration PRs (development → main): includes version bump commit BEFORE opening the PR.
>
> This skill is PROJECT-AGNOSTIC. It works with any stack (NestJS, React, Go, Python, etc.).

## Script Path

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-pr.mjs'))"
```

Store as `$SCRIPT`. Use in all commands below.

---

## Branch Logic (CRITICAL — read before anything else)

| Current branch                         | Push | PR target(s)                              | Behavior                                     |
| -------------------------------------- | ---- | ----------------------------------------- | -------------------------------------------- |
| `feat/*` `feature/*` `fix/*` `chore/*` | ✅   | → development/develop                     | Task PR                                      |
| `hotfix/*`                             | ✅   | → main/master **+** → development/develop | Two PRs                                      |
| `development` / `develop`              | ❌   | → main/master                             | Integration PR — version bump first, then PR |
| `main` / `master`                      | ❌   | —                                         | **ABORT** — "already on production branch"   |
| unknown prefix                         | ❌   | —                                         | **ABORT** — suggest correct prefix           |

---

## Workflow

### Stage 0 — Infrastructure Snapshot (integration PRs — run once per session)

> Only run this stage when: `isIntegrationPR: true` AND the user hasn't run it yet this session.
> Skip entirely for task PRs (feature/fix/chore/hotfix).

```
node "$SCRIPT" --check-cicd
```

Parse the JSON report and display a summary table:

| Category      | File(s) found         | Version-related patterns detected     |
| ------------- | --------------------- | ------------------------------------- |
| CI/CD         | (from `cicd[]`)       | BUILD_ARGS, version calc, tag job     |
| Dockerfile    | (from `dockerfile`)   | ARG APP_VERSION                       |
| Version files | (from `versionFiles`) | version field, releaseDate, CHANGELOG |
| Env templates | (from `envFiles`)     | OTEL_SERVICE_VERSION, SWAGGER_VERSION |
| App source    | (from `appCode`)      | version env var references            |

**Interpretation rule**: Do NOT judge correctness based on hardcoded expectations. Instead:

1. Show the table as-is (what was found)
2. Cross-reference with the project's `AGENTS.md` or conventions (if present in context)
3. If gaps are apparent from context (e.g., AGENTS.md documents a versioning convention but the CI file doesn't implement it), surface them as **observations**, not errors
4. Ask: "Do you want me to address any of these gaps before proceeding?"

If the user says yes → apply the suggested fixes, then continue to Stage 1.
If the user says no / skip → continue to Stage 1 directly.

---

### Stage 1 — Scan

```
node "$SCRIPT" --scan
```

Parse JSON. Fields available: `currentBranch`, `branchType`, `targetBranches`, `isIntegrationPR`, `isAbort`, `abortReason`, `isClean`, `uncommittedFiles`, `warnings`, `devBase`, `prodBase`, `platform`, `commits`, `totalCommits`, `commitHashesSummary`, `fileStats`, `filesByCategory`, `topFiles`, `hasBreakingChanges`, `breakingCommits`, `deployment`, `impactArea`, `baseBranch`, `lastProductionTag`.

- `isAbort: true` → show `abortReason` and **stop immediately**
- `isClean: false` → warn user: "uncommitted files — run /flow-commit first" and **stop**
- Show: detected branch type, target branch(es), platform

---

### Stage 2 — Version Bump (integration PRs ONLY)

**Only execute this stage if `isIntegrationPR: true`.**
Skip entirely for task PRs (feature/fix/chore/hotfix) and go directly to Stage 3.

#### Step 2a — Gather version context

```
node "$SCRIPT" --version-context
```

Parse JSON:

- `version.current` — current version (e.g. `"1.3.2"`)
- `version.lastTag` — last git tag (e.g. `"v1.3.2"`)
- `version.suggestedBump` — `"patch"` | `"minor"` | `"major"` (hint — verify semantically)
- `version.suggestedVersion` — calculated next version (e.g. `"1.3.3"`)
- `version.additionalFiles` — map of files that exist and may need updating
- `commits.log` — commit messages since last tag

#### Step 2b — Analyze bump type

Analyze `commits.log` semantically. Use `version.suggestedBump` as a **hint** but override if needed:

| Signals                                            | Bump  |
| -------------------------------------------------- | ----- |
| `BREAKING CHANGE`, `!` after type, removed exports | MAJOR |
| `feat(...)`, new capabilities, new endpoints       | MINOR |
| `fix(...)`, `chore(...)`, `docs:`, `refactor(...)` | PATCH |

Calculate `newVersion` from `version.current` if you override. Otherwise use `version.suggestedVersion`.

#### Step 2c — Generate CHANGELOG entry

Write a new entry in Keep a Changelog format. Prepend it after the `## [Unreleased]` line
(or at the top if no Unreleased section exists). Use today's date (YYYY-MM-DD).

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

Include only sections that have content.

#### Step 2d — Show confirmation panel (WAIT for approval)

```
╔══════════════════════════════════════════════════════╗
║           /flow-pr — Integration PR Release          ║
╠══════════════════════════════════════════════════════╣
║  Version:  {current}  →  {new}  ({BUMP_TYPE})        ║
║  Branch:   development  (version commit goes here)   ║
║  PR:       development → main                        ║
║  Date:     {YYYY-MM-DD}                              ║
╠══════════════════════════════════════════════════════╣
║  Files to be committed (determined after bump runs): ║
║    • package.json (always)                           ║
║    • package-lock.json (if exists)                   ║
║    • CHANGELOG.md                                    ║
║    • env templates (auto-updated by script)          ║
╠══════════════════════════════════════════════════════╣
║  CHANGELOG preview:                                  ║
║    {first 4 lines of the generated entry}            ║
╠══════════════════════════════════════════════════════╣
║  Git actions:                                        ║
║    npm version X.Y.Z --no-git-tag-version            ║
║    (auto: releaseDate + env templates updated)       ║
║    git add <files>                                   ║
║    git commit "chore(release): bump version to X.Y.Z"║
║    git push origin development                       ║
║    ➕ CI/CD will create tag v{new} after merge       ║
╚══════════════════════════════════════════════════════╝
Proceed? (yes / no)
```

If the user says **no** → abort. No files have been changed yet.

#### Step 2e — Run version bump

```
node "$SCRIPT" --update-version --version X.Y.Z
```

Parse response:

- `updatedByNpm` — files modified by npm (package.json, package-lock.json)
- `releaseDateUpdated` — true if `releaseDate` field was auto-updated in package.json
- `updatedEnvFiles` — env template files that were auto-updated (OTEL_SERVICE_VERSION, SWAGGER_VERSION)
- `additionalUpdates` — any remaining files needing manual edits

If `additionalUpdates` is non-empty → apply those manual edits before continuing.

#### Step 2f — Commit the version bump

Build `--files` argument from:

- `updatedByNpm` (always includes package.json)
- `updatedEnvFiles` (auto-updated env templates, if any)
- `CHANGELOG.md`
- Any files from `additionalUpdates` that were manually edited

All comma-separated, no spaces.

```
node "$SCRIPT" --commit-version --version X.Y.Z --files "package.json,package-lock.json,CHANGELOG.md,.env.template,.env.prod.template"
```

Parse JSON: `success`, `steps`. If any step failed → show failure and stop.

#### Step 2g — Push development with the version commit

```
node "$SCRIPT" --push
```

If `success: false` → show error + suggest `git pull origin development --rebase`.

---

### Stage 3 — Push (task PRs only)

**If NOT integration PR:**

```
node "$SCRIPT" --push
```

If `success: false` → show error + suggest `git pull origin <branch> --rebase`

---

### Stage 4 — Generate PR Description + Jira Comment

Use all context from Stage 1 (and Stage 2 if integration). Generate different content based on `isIntegrationPR`:

**Task PR** (feature/fix/chore/hotfix): standard PR description focused on the specific change.
**Integration PR** (development → main): executive summary of ALL changes since last production release. Include the version bump in the summary. Tone: "this batch is ready for production".

Output format — in this exact order:

1. Plain-text visual separator
2. PR Description block (4-backtick fence)
3. Plain-text visual separator
4. Jira Comment block (4-backtick fence)

**Visual separators:**

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

**Wrapper rule**: 4-backtick outer fence. Internal code blocks use normal triple-backtick.

---

**PR Description block** — English — audience: code reviewers

- No H1. Use `##` sections (max 5).
- Total length: 150–350 words.
- Sections: `## Summary`, `## Changes`, `## Testing`, `## Checklist`, optionally `## Breaking Changes`, `## Deployment Notes`
- `## Breaking Changes` only if `hasBreakingChanges: true`
- `## Deployment Notes` only if `deployment.showDeploymentNotes`
- For integration PRs: add version bump to Summary (`bumps version X.Y.Z → A.B.C`)

**Jira Comment block** — Spanish — audience: QA, PM, stakeholders

- Max heading: `###`
- Total length: ≤200 words
- No technical implementation details
- Sections: `### 🚀 <TIPO>: <titulo>`, bold summary paragraph, `### ✅ Cómo validar`, `### 📋 Evidencia` table

---

### Stage 5 — Create PR(s) on GitHub

For each target in `targetBranches`:

1. Build PR title:
   - Task PRs: derived from branch name (e.g. `fix/auth-token` → `fix: auth token`)
   - Integration PRs: **always** `chore(release): bump version to X.Y.Z` (never a freeform title)
   - Hotfix PRs to prod: `hotfix: <branch-name-as-title>`
2. Write PR body to temp file
3. Create PR:

```
node "$SCRIPT" --create-pr --target <branch> --title "<title>" --body-file "<path>"
```

If hotfix (2 targets): create both PRs. Show both URLs.

Output after PRs created:

```
✅ Push OK — <branch> → origin
✅ PR created: <url>           (for task PRs)
✅ PR 1 created: <url>         (for hotfix)
✅ PR 2 created: <url>         (for hotfix)

─────────────────────────────────────────
💬 JIRA COMMENT  (copiar y pegar en Jira)
─────────────────────────────────────────
[jira comment content]
```

For integration PRs, also show:

```
📦 Version bump committed: {old} → {new} on development
🏷️  Tag v{new} will be created by CI/CD after merge to main
```

---

### Stage 6 — Playbook Sync (silent post-PR step)

After the PR output is shown, silently run the flow-playbook-sync normal mode (no `--init`).

1. Check if `.flow-skills/playbook-status.md` exists in the project root.
   - If it does **NOT** exist → skip entirely. Do not mention it. Do not run anything.

2. If the file exists, run the flow-playbook-sync normal flow internally.
   - If it detects **no changes** (nothing to move from pending → implemented, nothing new) → skip output entirely. Do not mention it.
   - If it detects **proposals** → append to the PR output:

```
💡 Playbook sync — se detectaron actualizaciones:
[mostrar las propuestas del sync para que el usuario las apruebe]
```

**Rules:**
- NEVER mention `/flow-playbook-sync` if `.flow-skills/playbook-status.md` does not exist
- NEVER mention `/flow-playbook-sync` if the sync detected no changes
- Only surface proposals when there's actually something actionable for the user

---

## Restrictions

- NEVER push without running Stage 1 (scan) first
- NEVER push if `isAbort: true`
- NEVER create PR without user seeing the description first (show it, then create)
- NEVER run tests — use /flow-audit for that
- NEVER commit any changes except the version bump in Stage 2 (and only when confirmed)
- NEVER create a release branch — version commit goes directly on `development`
- NEVER create git tags manually — CI/CD handles tagging after merge to main
- NEVER judge CI/CD structure as "wrong" — use --check-cicd to describe, use AGENTS.md context to interpret
- NEVER update env templates manually — the --update-version script handles OTEL_SERVICE_VERSION and SWAGGER_VERSION automatically
