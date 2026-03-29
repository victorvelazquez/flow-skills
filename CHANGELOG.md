# Changelog

All notable changes to this project will be documented here.

Format: [Conventional Commits](https://www.conventionalcommits.org/) — `feat`, `fix`, `docs`, `chore`, `refactor`.

---

## [0.3.0] — 2026-03-29

### Added

- `flow-build` script — `playbookDetected` context field in both `modeDetect()` and `buildContextResult()` output; enables automatic Playbook Mode activation when a `playbook/` directory is present in the project

### Changed

- `flow-build` skill — updated SKILL.md with cleaner playbook phase notes; phase note now references playbook variants (`phase-N-playbook.md`) instead of specific file counts; added explicit playbook detection step in Phase 0

---

## [0.2.0] — 2026-03-28

### Added

- `flow-build` skill — Playbook Mode (35-50 min) for projects using the shared engineering playbook; 5 new phase files (`phase-3-playbook`, `phase-4-playbook`, `phase-5-playbook`, `phase-6-playbook`, `phase-8-playbook`)
- `flow-playbook-sync` skill — new skill for syncing the shared engineering playbook across projects
- `flow-pr` skill — new skill for pushing branches and creating GitHub PRs with AI-generated descriptions
- `playbook/` — shared engineering playbook (backend-stack, api-contract, testing-strategy, infra-stack, mobile-stack)
- `skills/flow-build/REFACTOR-PROMPT.md` — master prompt for systematic phase refactoring

### Changed

- `flow-build` skill — complete DX refactor of all 9 phases (Standalone Mode): AI proposes, dev approves; ~55% line reduction; estimated flow time reduced from 75-90 min to 30-45 min
- `flow-build` skill — SKILL.md rewritten with explicit Playbook Mode vs Standalone Mode separation
- `flow-build` phases — eliminated cross-phase question duplication, converted technical questions to visible smart defaults (✅), added `🧠 AI:` inference directives throughout
- `flow-audit` skill — updated
- `flow-commit` skill — updated
- `flow-skills` skill — updated workflow for main-branch publish

---

## [0.1.0] — 2026-03-22

### Added

- `flow-skills` skill — `flow-skills.mjs` script for LLM token offloading; safe publish via release branch workflow

### Changed

- `flow-build` skill — added `--context`, `--entity-scan`, `--smart-skip`, `--write-cache` script flags
- `flow-build` skill — fixed `deployment.md` → `operations.md` references, removed dead refs, trimmed phase bleed
- `flow-build` skill — fixed malformed cache reason distinction in `--smart-skip`; gitignore cache dir
- `install.mjs` — emit `exported:` prefix per file in `--export` mode

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
