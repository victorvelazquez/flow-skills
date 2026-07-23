---
description: Run the post-implementation delivery loop: audit, bounded fixes, commit, push, and PR.
---

Run a bounded post-implementation delivery loop for the current working tree.

This command assumes the feature/fix is already implemented. Do NOT implement a new product task from scratch unless the user explicitly included a small, concrete fix instruction in `$ARGUMENTS`.

## Arguments

- User instructions: `$ARGUMENTS`

Use `$ARGUMENTS` only to constrain scope, for example: target branch, issue key, files to include/exclude, or whether PR creation should stop before push. If arguments are empty, infer scope from the current diff only.

## Authorization boundary

This command authorizes, for the current working tree only:

1. inspect git state and diff;
2. run the equivalent of `/flow-audit`;
3. fix real audit failures that are directly caused by the current diff;
4. run the equivalent of `/flow-commit` with its dry-run and safety checks;
5. run the equivalent of `/flow-pr` with its dry-run and safety checks.

It does NOT authorize unrelated implementation, broad refactors, historical debt cleanup, destructive migrations, public contract changes, or work on files unrelated to the current change unless the user explicitly confirms.

When `/flow-refactor` or `/flow-audit` produces explicit `Debt Task Drafts` for existing debt, this command may route those drafts through `/flow-debt create` to persist them under project-local `.flow/debt/` if doing so is explicitly within the delivery scope. Persisting a debt artifact is not authorization to fix that existing debt. Existing debt must remain untouched unless the user invokes `/flow-debt apply <id>` or gives explicit bounded authorization.

## Phase 0 — Preflight

1. Detect project and working directory.
2. Check recent project memory when Engram is available.
3. Run git state checks:
   - current branch;
   - `git status --short`;
   - changed files;
   - diff summary/stat.
4. Stop before changing anything if:
   - the repository is on a protected branch (`main`, `master`, `develop`, `development`) AND the delivery flow cannot rely on `/flow-commit` to create a safe feature/fix branch before committing;
   - the working tree contains unrelated changes that cannot be separated confidently;
   - there are merge/rebase/conflict states;
   - the repository is not a git repository;
   - required project tools are unavailable.

Being on a protected branch is allowed for refactor/audit work against uncommitted changes. The hard boundary is committing: commit creation must go through `/flow-commit`, which owns branch creation and protected-branch handling. Never create a manual commit directly on a protected branch.

## Phase 1 — Audit loop

Run the equivalent of:

```text
/flow-audit --auto
```

If the active `/flow-audit` project profile relaxes tests by default (for example TecnomylPY.Backend), include the profile flag:

```text
/flow-audit --auto --skip-tests
```

If exact command nesting is unavailable, read and follow `~/.config/opencode/skills/flow-audit/SKILL.md` through the appropriate review sub-agent.

Automatically fix only real failures or important warnings caused by the current diff.

If the audit reports existing/tooling gaps as explicit Debt Task Drafts, optionally persist them to `.flow/debt/` by routing through `/flow-debt create` when authorized, but do not fix them in this loop.

## Debt draft persistence policy

- Only persist Debt Task Drafts that are explicitly emitted in the visible `/flow-refactor` or `/flow-audit` output for existing/tooling debt.
- Do not invent debt tasks from summaries, memory, or generic warnings.
- Do not stop the delivery loop solely because pre-existing debt drafts already exist; persist them when authorized and continue.
- Still stop for current-diff blockers, failed validations, risky scope expansion, or any other normal stop condition in this command.
- Never auto-apply persisted debt tasks in this loop. Debt persistence and debt remediation are separate actions.

After fixing, rerun the audit. Maximum: 2 audit-fix rounds.

Stop and ask the user if:

- the same failure repeats after 2 attempts;
- checks fail because of unrelated/global project state;
- the fix requires broad scope expansion;
- the fix touches security, auth, permissions, payments, data model, destructive migrations, tenant isolation, or public contracts in a way not already authorized.

## Phase 2 — Commit gate

Run the equivalent of:

```text
/flow-commit
```

Follow its dry-run and branch-protection workflow exactly.

Rules:

- Include only files related to the current change.
- Use conventional commits.
- Prefer atomic work-unit commits when the diff naturally splits.
- Stop if the commit plan includes unexpected files.
- Do not bypass hooks, do not amend unrelated commits, and do not force-push.

## Phase 3 — PR gate

Run the equivalent of:

```text
/flow-pr
```

Follow its dry-run workflow exactly.

Rules:

- Stop if the working tree is not clean after commits.
- Push only the intended feature/fix branch.
- Create or update the PR safely if a PR already exists.
- Include checks executed, risks, migrations, rollback notes, screenshots/testing notes when relevant.
- Preserve the `/flow-pr` output contract exactly: pass the dry-run `planId` to ordinary execution, then include the runtime-returned `jiraComment` verbatim as a separate copy-ready artifact. Do not print the GitHub PR description, post to Jira, or create/link GitHub Issues.

## Phase 4 — Post-PR correction loop

If PR creation, CI, or a review check surfaces a failure that is clearly inside the current change scope:

1. fix it;
2. rerun the audit loop;
3. rerun the commit gate;
4. rerun the PR gate.

Maximum: 2 post-PR correction cycles. Stop after that and report the blocker.

## Global stop conditions

Stop before commit/PR if any of these occur:

- unrelated working tree changes are present;
- diff grows disproportionately for the intended change;
- a protected branch would be committed to directly instead of going through `/flow-commit` branch creation;
- a destructive migration or data-loss risk appears;
- an undocumented public contract change appears;
- non-trivial security, privacy, auth, permissions, payment, or tenant-isolation risk appears;
- validations cannot be executed and cannot be justified;
- generated PR would exceed a reasonable review size and should be split.

## Final response

If completed with PR, respond with:

- PR URL;
- commits created;
- files changed;
- checks executed and results;
- audit fixes applied;
- risks/deferred work;
- confirmation that scope stayed within the initial diff/user arguments.
- copy-ready `jiraComment` returned by the `/flow-pr` runtime, verbatim and separate from the GitHub body.

Do NOT omit or rewrite `jiraComment` just because this command is summarizing the full delivery loop. If `/flow-pr` created or updated PRs, include the complete runtime artifact. Never post it automatically or include the PR description unless the user explicitly asks for it.

If stopped, respond with:

- phase where it stopped;
- concrete cause;
- attempts performed;
- evidence;
- recommended next action.

Persist important decisions, bug fixes, discoveries, or workflow patterns to Engram when available.
