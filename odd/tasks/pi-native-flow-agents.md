# Pi-Native Flow Agents

## Objective

Create clean, first-class Pi agents for `flow-commit`, `flow-pr`, and `flow-branch`, keep `flow-skills` as their canonical source, install them into the user's global Pi home, and ensure Gentle Pi profile snapshots preserve their model routing without modifying `gentle-pi`.

## Problem

The three Flow workflows currently ship to Pi only as skills. Manual routing entries in `~/.pi/gentle-ai/profiles.json` disappear when Snapshot replaces a profile from the effective agent routing because no discoverable Pi agents exist for those names.

## Why

The user wants portable, backup-friendly Pi-native files that can be restored on another machine and managed independently from external tooling.

## Scope

- Add canonical Pi agent definitions for `flow-commit`, `flow-pr`, and `flow-branch`.
- Add native Pi prompt templates that invoke those agents.
- Keep each workflow contract in its existing Pi skill; agents must load and execute that skill without OpenCode syntax or compatibility shims.
- Package the Pi-native resources from this repository.
- Install the package and global agent definitions into the current Pi home.
- Restore routing entries in both `openai-normal` and `openai-full` after agents become discoverable.
- Add focused contract tests and concise documentation.

## Constraints

- Do not modify `gentle-pi`.
- Technical artifacts are written in English.
- Preserve each existing Flow runtime as the mutation authority.
- Keep one supervised agent session per workflow; agents must not delegate.
- Avoid copying OpenCode permissions or adapter syntax.
- Global installation must have a repository-backed canonical source and a documented recovery path.
- No commit, push, package publication, or release without separate user authorization.

## TDD and Verification

- TDD mode: disabled for this organic change because only SDD strict TDD is configured; no ODD TDD mode is configured.
- Test runner: `node --test`.
- Focused commands are listed per task; full verification is `node --test tests/*.test.mjs`.

## Delivery

- Strategy: `ask-on-risk`.
- Forecast: approximately 300 authored changed lines excluding generated lockfiles.
- Branch: `feat/pi-native-flow-agents`.
- Native review: disabled for this clone.

## Tasks

- [x] **PFA-1 — Define and package Pi-native agents and prompts**
  - Route: delegated writer; triggers: preparation and multi-file write.
  - Added three Pi agent definitions and three supervised Pi prompt templates.
  - Declared prompts as Pi package resources and agent definitions as canonical packaged source without duplicating workflow behavior.
  - Added focused tests for package inclusion, clean Pi syntax, matching skill loading, non-delegation, argument forwarding, task mode, and model inheritance.
  - Writer check: `node --test tests/pi-agent-adapter.test.mjs tests/pi-package.test.mjs` — 7 passed, 0 failed, 0 skipped.
  - Independent verification: the same test command passed 7/7; `git diff --check` passed with one informational LF-to-CRLF warning.
  - Native assessment was unavailable because untracked paths require explicit review declaration; RDD is off, so an independent verifier was run and passed.
  - Commit evidence: intentionally pending because the user did not authorize commits.

- [x] **PFA-2 — Document installation and recovery boundaries**
  - Route: delegated writer; trigger: multi-file write.
  - Documented local-package installation, repository-backed global agent installation, restart/discovery checks, Snapshot behavior, backup/recovery, and the external-tool boundary.
  - Added canonical agents and prompts to Pi provenance and regenerated all affected locks with `writeProvenance(process.cwd())`.
  - Focused writer and independent checks passed 24/24.
  - Full-suite remediation made active README text host-neutral and, with explicit user approval, excluded only `docs/multihost-migration.md` as the implementation-specific integration surface; the focused remediation suite passed 25/25.
  - Commit evidence: pending user-authorized Flow Commit execution.

- [x] **PFA-3 — Install and verify the global Pi integration**
  - Route: parent-controlled global installation followed by delegated independent verification.
  - Registered the local repository through `pi install` and installed byte-matched canonical definitions in the global Pi agent directory.
  - Restored the approved routing in `subagents.json`, `openai-normal`, and `openai-full` with timestamped backups.
  - Runtime discovery now lists `flow-commit`, `flow-pr`, and `flow-branch`; package prompts are registered by the local package.
  - Pi provenance verification passed for 73 records and 712,083 bytes.
  - Independent full suite: 360 passed, 0 failed, 7 Windows capability skips; `git diff --check` passed with informational line-ending notices only.
  - Commit evidence: pending user-authorized Flow Commit execution.

## Acceptance Criteria

1. Pi discovers `flow-commit`, `flow-pr`, and `flow-branch` as real agents.
2. `/flow-commit`, `/flow-pr`, and `/flow-branch` are native Pi prompt entrypoints.
3. Each agent loads the matching package skill and uses its package-relative runtime.
4. No new artifact contains OpenCode-only syntax, paths, or compatibility behavior.
5. Gentle Pi effective routing includes all three agents, so Snapshot preserves them.
6. The repository contains canonical, backup-friendly resources and recovery instructions.
7. Focused and full verification results are recorded honestly.

## Progress

- Exploration completed: Pi packages support skills and prompts but not agent definitions; Gentle Pi discovers global/project agent Markdown files.
- User selected repository canonical source plus global installation.
- Feature branch created.
- PFA-1 completed and independently verified: canonical agents, prompts, packaging, and focused contracts are present.
- PFA-2 completed after the user-approved narrow migration-guide exemption; README remains host-neutral and focused verification passes.
- PFA-3 completed: global package registration, byte-matched agent installation, runtime discovery, approved routing, provenance, and full-suite verification all passed.

## Next Step

Use the newly discovered `flow-commit` agent to create the work-unit commit, then open the PR through `flow-pr`.
