# Changelog

All notable changes to this project will be documented here.

Format: [Conventional Commits](https://www.conventionalcommits.org/) — `feat`, `fix`, `docs`, `chore`, `refactor`.

---

## [0.0.1] — 2026-03-18

### Changed
- Extracted shared helpers module (`scripts/lib/helpers.mjs`) and synced `PROTECTED_BRANCHES` across all scripts
- Removed hardcoded Windows absolute paths from `skills/flow-skills/SKILL.md`, replaced with `git rev-parse --show-toplevel`
- Fixed `install.mjs` to recursively copy `scripts/lib/` subdirectory via `collectFiles()`
- Fixed `RELEASE_BRANCHES` in `flow-release.mjs`: `"develop"` → `"development"`
- Fixed `runSafe` in `flow-finish.mjs` and `flow-docs-sync.mjs` to delegate to `run()` instead of calling `execSync` directly
- Fixed perspective count in `commands/flow-audit.md`: `5-perspective` → `8-perspective`
- Aligned `develop` branch in `skills/flow-commit/SKILL.md` protected branch lists
- Clarified `phases/` directory status in `skills/flow-build/SKILL.md`
- Added Windows device file exclusions to `.gitignore` (nul, con, prn, aux, com1-9, lpt1-9)
- Added `.atl/` to `.gitignore`

---

## [1.0.0] — 2026-03-18

### Added

- `flow-audit` skill — code quality audit with lint, typecheck, tests, security, and AI review
- `flow-branch` skill — interactive branch switcher with pull prompt and local branch cleanup
- `flow-build` skill — universal documentation builder across 11 phases (15-17 docs)
- `flow-commit` skill — git workflow automation with Conventional Commits and atomic commits
- `flow-docs-sync` skill — incremental documentation sync detecting codebase changes
- `flow-finish` skill — professional PR description and Jira comment generator
- `flow-release` skill — semantic versioning, CHANGELOG generation, git tag, and push
- `flow-skills` skill — conversational manager for this repository (publish, update, install)
- `install.mjs` — cross-platform Node.js installer (zero deps): install, export, dry-run, uninstall modes
