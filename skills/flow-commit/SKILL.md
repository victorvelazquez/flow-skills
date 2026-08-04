---
name: flow-commit
description: "Trigger: /flow-commit. Prepare semantic commit units and execute one sealed, verified Git transaction."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "6.0"
---

# flow-commit

## Activation Contract

Load for `/flow-commit` or a request to commit current local changes through Flow.

## Hard Rules

- Treat `scripts/flow-commit.mjs` as the Git execution source of truth.
- Keep one specialized agent. It reads necessary diffs, chooses branch action and ordered semantic units, and never delegates or sends full diff/request context through another agent.
- Each unit owns exact disjoint paths and uses `type(scope): outcome`, or `type(scope)!: outcome` for a breaking compatibility change. Add an optional exact-preserved body only when useful; it may include a `BREAKING CHANGE: ...` footer.
- Never use direct Git mutation, push, PR, audit, build, install, sync, automatic retries, hook skipping, or global rollback.
- Raw JSON, snapshots, fingerprints, sealed requests, handles, and temp paths are internal. User output is compact prose.
- The OpenCode `ask` permission on `--execute --handle` is the one human mutation approval. Never ask for a separate conversational confirmation.
- Permit only one bounded correction of the same intent file after non-consuming validation reports `invalid-json`, `invalid-intent`, `coverage-mismatch`, `invalid-branch`, or `protected-branch`. Otherwise stop once on noop, blocker, drift, partial, failure, or unknown effects; a retry requires fresh user action and preparation.

## Decision Gates

| Prepared branch state | Required intent branch action |
| --- | --- |
| `protected` is `true` | Use `{"action":"create","name":"<type>/<task>"}`. Derive a concise lowercase kebab-case task name from the dominant work unit; the complete name must pass `git check-ref-format --branch`. |
| `protected` is `false` | Use `{"action":"keep"}`. |

Never keep a protected branch. Branch creation belongs only to the sealed Flow Commit execution; do not run Git directly. Successful creation transactionally records `branch.<new>.gh-merge-base=<source>` and verifies it before committing; creation rollback removes both the branch and stale provenance.

## Workflow

1. Run `node ~/.config/opencode/scripts/flow-commit.mjs --prepare`. It returns only compact drafting facts plus a runtime-owned OS-temp `intentPath` and opaque handle. `noop` ends the workflow.
2. Read only necessary `git diff`, `git log`, `git show`, and `git status` information in this same agent session.
3. Edit the pretty strict `flow-commit/intent-v2` template already authored at the returned `intentPath` using the path-scoped `apply_patch` permission. The runtime derives it only from prepared facts: it fixes the branch action from `protected`, creates one unit with exact prepared path coverage, omits `body`, and leaves semantic placeholders that validation rejects until the agent replaces them. Its shape is:

   ```json
   {"schema":"flow-commit/intent-v2","branch":{"action":"create","name":""},"units":[{"paths":["literal/path"],"title":""}]}
   ```

   On a non-protected branch, the runtime uses `{"action":"keep"}`. For one unit, edit only the title and, on a protected branch, the branch name. For multiple units, deliberately replace the units block while preserving exact disjoint prepared path coverage. Preserve the runtime-authored schema and branch action; never reconstruct the whole document or invent a valid title or branch name on the runtime's behalf. Add an optional body only when useful.

4. Run `--validate-intent --handle <prepare-handle>`. It authenticates prepared authority and validates intent without sealing, claiming, locking, mutating Git, or consuming a valid store. On one approved authoring failure only, correct the same `intentPath` once and validate once more without rereading Git facts, starting another agent, or preparing again. A second or nonrecoverable failure stops.
5. Run `--prepare --handle <prepare-handle>` once to seal it. Present repository basename, current branch/HEAD abbreviation, branch action, ordered titles, exact paths, body presence/byte counts, and totals. Keep both opaque handles internal. The returned sealed execute handle binds the approved request digest in addition to the original prepared digest. Do not display the raw runtime document and do not ask for approval separately. Seal remains authoritative for repository/content drift, branch conditions, expiry, and intent.
6. Invoke `--execute --handle <sealed-execute-handle>` once. Its permission prompt is the one human mutation approval. Report compact verified results; success lists commit OID/title and counts without bodies or repeated path arrays. Partial/failure includes actionable remaining paths and recovery. Seal and execute failures require fresh user action, not retries.

## Safety Contract

Preparation binds the exact strict prepared-envelope bytes into the opaque prepare handle digest, then internally binds canonical repository/common-dir identity, branch, HEAD, empty index, operation state, path statuses, bytes, executable mode, deletions, untracked content, and symlink targets. Seal returns an internal execute handle carrying both the prepared digest and sealed request digest. Execute validates both caller-carried digests before trusting authority, then reinspects repository authority and atomically claims the handle and repository-scoped lock before mutation.

Intent validation is deterministic, read-only, repeatable, and non-consuming after prepared authority is accepted. It returns only compact safe diagnostics and never grants execute authority. Prepared tamper, expiry, unsafe files or ownership, invalid handles, branch collisions, and unknown failures remain fail-closed; overloaded intent-like codes raised while authenticating prepared authority are never treated as recoverable.

Commits retain hooks, exact staging, write-tree, parent/tree/path/message postconditions, CAS rollback for a rejected runtime commit, partial completed commits, and leftovers. Hook identity is never claimed; only observable hook effects and postconditions are reported. Abandoned claims/locks and consumed handles fail closed and require fresh preparation.

## Output Contract

- Before execute: repository basename, current branch/HEAD abbreviation, current/create branch action, ordered titles, exact paths, body presence/bytes, and file/commit totals.
- Success: status, branch effect, OID/title per commit, counts, empty leftovers.
- Every result distinguishes verified `completed` commits, active `stoppedAt` unit or null, later `notAttempted` units, exact intended `outstandingPaths`, and broader observed `leftovers`.
- Partial/failure: report those concepts, observed effects, and fresh-prepare recovery without implying that an unattempted unit failed.
- Never repeat bodies or expose request/snapshot/fingerprint internals.
