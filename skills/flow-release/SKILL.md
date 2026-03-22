---
name: flow-release
description: Semantic versioning + CHANGELOG generation + git tag + push — automated frontend release workflow
trigger: /flow-release command
---

# flow-release

Trigger: user runs `/flow-release`

Script path:

```
node -e "const os=require('os'),path=require('path');console.log(path.join(os.homedir(),'.config','opencode','scripts','flow-release.mjs'))"
```

Store result as `$SCRIPT`. Use it in all commands below.

---

## Stage 1 — Script-driven: gather context

```
node "$SCRIPT" --context
```

Parse JSON: `git` (branch, isReleaseBranch, isClean, dirtyFiles, hasOrigin), `version` (system, current, lastTag, additionalFiles, hasMismatch, allDetected), `commits` (count, since, log).

**Pre-flight — abort if:**

- `git.branch !== 'development' && git.branch !== 'develop'` → abort: `"❌ Release must start from 'development' or 'develop' branch. Current: {branch}. Please switch to the integration branch first."`
- `git.isClean` is false → abort and show dirtyFiles
- `git.hasOrigin` is false → abort

If `version.hasMismatch: true`, show detected versions and ask: auto-sync, fix manually, or cancel.

---

## Stage 2 — LLM analysis

### 2.1 Determine bump type

Analyze `commits.log`. Priority: BREAKING → MAJOR · FEATURE → MINOR · else → PATCH.

| Signals                                                         | Category | Bump  |
| --------------------------------------------------------------- | -------- | ----- |
| `BREAKING CHANGE`, `!` after type, removed exports/routes/props | BREAKING | MAJOR |
| `feat(...)`, new components/pages/hooks/stores                  | FEATURE  | MINOR |
| `fix(...)`, perf, a11y, CSS bugs                                | FIX      | PATCH |
| `chore(...)`, deps, build config                                | CHORE    | PATCH |

If user passed `--major`, `--minor`, `--patch`, or an explicit version, use that instead.

### 2.2 Calculate new version

Parse `version.current` (X.Y.Z). Apply bump → new version string.

### 2.3 Generate CHANGELOG entry

Keep a Changelog format. Sections: `### Added`, `### Changed`, `### Fixed`, `### Removed`. Date: today (YYYY-MM-DD). Prepend after `## [Unreleased]` in `CHANGELOG.md`.

### 2.4 Update additional version files

For each key in `version.additionalFiles` that is `true`, read and update:

- `public/manifest.json` / `manifest.json` → `version`, `version_name`
- `src/version.ts` / `.js` → `APP_VERSION` constant, `BUILD_DATE` (ISO now)
- `src/config.ts` / `.js` → version field/constant if present
- `public/index.html` → `<meta name="version">` and `<meta name="build-date">` if present
- `.env.production` → `VITE_APP_VERSION` / `REACT_APP_VERSION` if present

**Swagger + environment version sync (always apply if files are present):**

- Update `SWAGGER_VERSION=` in `.env` (if present)
- Update `SWAGGER_VERSION=` in `.env.template` (if present)
- Update `SWAGGER_VERSION=` in `.env.prod.template` (if present)
- Update `OTEL_SERVICE_VERSION=` in `.env` (if present)
- Update `OTEL_SERVICE_VERSION=` in `.env.template` (if present)
- Update `OTEL_SERVICE_VERSION=` in `.env.prod.template` (if present)
- Update `"releaseDate"` field in `package.json` → set to today's date (YYYY-MM-DD)

> Note: Swagger UI version badge is driven by `package.json` → `.setVersion(packageJson.version)` at runtime. Updating `package.json` is sufficient for Swagger UI to reflect the new version.

### 2.5 Update package.json via script

```
node "$SCRIPT" --update-version --version <newVersion>
```

Updates `package.json` (and `package-lock.json`) via `npm version --no-git-tag-version`.

### 2.6 Confirmation panel

Show before executing (ASCII box: old→new, bump type, date, files to update, git actions):

- Base branch: `development` or `develop`
- Release branch: `release/vX.Y.Z` (will be created)

Wait for user confirmation.

---

## Stage 3 — Script-driven: execute release

After confirmation:

1. Create and checkout the release branch from `development` or `develop`:

   ```
   git checkout -b release/vX.Y.Z
   ```

2. Pass all modified files to the script:

   ```
   node "$SCRIPT" --execute --version <newVersion> --files "package.json,CHANGELOG.md,<others>"
   ```

   Performs: `git add` → `git commit "chore(release): bump version to X.Y.Z"` → `git tag -a vX.Y.Z` → `git push -u origin release/vX.Y.Z` → `git push origin vX.Y.Z`.

   > All commits go on `release/vX.Y.Z`. Do NOT push to `development`/`develop` or `main` — the release branch is a PR candidate.

Parse result: check each `step.ok`. Report failures.

---

## Output Format

```
Release v<new> prepared on branch release/v<new>.
  Updated: <files>  |  Commit: chore(release): bump version to <new>
  Tag: v<new>  |  Branch: release/v<new> pushed to origin
  ⚠️  Open a PR: release/v<new> → main
```

`--dry-run`: Stage 1 + Stage 2 analysis only. Show panel. Branch `release/vX.Y.Z` would be created from `development` or `develop` — no git operations executed. State "Dry-run complete — no changes made."

---

## Restrictions

- Never execute without user confirmation
- Never release from a dirty working tree
- `--dry-run` stops after the confirmation panel — no script `--execute`
