---
name: flow-commit
description: "Trigger: /flow-commit. Prepare semantic commit units and execute one sealed, verified Git transaction."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "7.0"
---

# flow-commit

## Activation Contract

Load for `/flow-commit` or a request to commit current local changes through Flow.

## Hard Rules

- Treat `scripts/flow-commit.mjs` as the Git execution source of truth.
- Keep one specialized agent. It reads necessary diffs, chooses ordered semantic units, and never delegates or sends full diff/request context through another agent.
- Each unit owns exact disjoint prepared ordinals and uses `type(scope): outcome`, or `type(scope)!: outcome` for a breaking compatibility change. Add an optional exact-preserved body only when useful; it may include a `BREAKING CHANGE: ...` footer.
- Never use direct Git mutation, push, PR, audit, build, install, sync, generic file writes, shell encoding/substitution/redirection, automatic retries, hook skipping, or global rollback.
- Raw payloads, snapshots, fingerprints, sealed requests, handles, and temp paths are internal. User output is compact prose.
- The OpenCode `ask` permission on `--execute --handle` is the one human mutation approval. Never ask for a separate conversational confirmation.
- Permit only one bounded structured author correction after `invalid-payload`, `invalid-intent`, `coverage-mismatch`, `invalid-branch`, or `protected-branch`. Otherwise stop once on noop, blocker, drift, partial, failure, or unknown effects; a retry requires fresh user action and preparation.

## Decision Gates

| Prepared branch state | Required author field and runtime action |
| --- | --- |
| `protected` is `true` | Supply `branchName: "<type>/<task>"`; runtime derives create. Derive a concise lowercase kebab-case task name from the dominant unit and ensure the complete name passes `git check-ref-format --branch`. |
| `protected` is `false` | Omit `branchName`; runtime derives keep. |

Never keep a protected branch. Branch creation belongs only to sealed execution. Successful creation transactionally records `branch.<new>.gh-merge-base=<source>` and verifies it; creation rollback removes both branch and stale provenance.

## Workflow

1. Run `node ~/.config/opencode/scripts/flow-commit.mjs --prepare`. It returns compact ordered changes and an opaque prepare handle, never a writable path. `noop` ends the workflow.
2. Read only necessary `git diff`, `git log`, `git show`, and `git status` information in this same agent session.
3. Define strict `flow-commit/author-intent-v1` semantics. Units reference only zero-based prepared ordinals, in unit order, with every ordinal covered exactly once and no duplicates. Supply `branchName` only when prepare reports `protected: true`:

   ```json
   {"schema":"flow-commit/author-intent-v1","branchName":"fix/task-name","units":[{"ordinals":[0,1],"title":"fix(scope): outcome"}]}
   ```

4. Construct transport through the read-only runtime helper: `--encode-author-intent --handle <prepare-handle> [--branch-name <name>] --unit <comma-ordinals> --title <title> [--body <body>] ...`. Pass text as single quoted arguments without shell control syntax; omit an optional body rather than weakening permissions. The helper validates semantics and emits one canonical unpadded Base64URL token. The token is limited to 6000 characters so the complete invocation remains conservatively below Windows' 8191-character command boundary and POSIX limits. There is no chunking. Never encode mentally.
5. Run `--author-intent --handle <prepare-handle> --payload-b64url <token>`. The runtime strictly rejects padding, invalid alphabet, non-canonical re-encoding/JSON, malformed UTF-8/JSON/schema, extras, duplicate or out-of-range ordinals, missing coverage, and oversize payloads. One recoverable invalid attempt is non-consuming; correct structured fields and repeat encoder plus author at most once. Successful authoring is exclusive and exact replay is idempotent.
6. Run `--seal --handle <authored-handle>` once. Present repository basename, current branch/HEAD abbreviation, runtime-derived branch action, ordered titles, exact paths, body presence/byte counts, and totals. Keep opaque handles internal. Seal remains authoritative for repository/content drift, branch conditions, collision, expiry, and authored intent.
7. Invoke `--execute --handle <sealed-handle>` once. Its permission prompt is the one human mutation approval. Report compact verified results; success lists commit OID/title and counts without bodies or repeated path arrays. Partial/failure includes actionable remaining paths and recovery. Seal and execute failures require fresh user action, not retries.

## Safety Contract

Preparation binds the exact strict v3 prepared-envelope bytes into the opaque prepare handle digest, then internally binds canonical repository/common-dir identity, branch, HEAD, empty index, operation state, path statuses, bytes, executable mode, deletions, untracked content, and symlink targets. Author and seal return phase-specific digest-bound handles. Execute validates prepared, authored, and sealed digests before trusting authority, then reinspects repository authority and atomically claims the handle and repository-scoped lock before mutation.

The encoder is deterministic and read-only; authoring is runtime-owned and grants only authored authority. Prepared tamper, expiry, unsafe files or ownership, invalid handles, branch collisions, and unknown failures remain fail-closed. Obsolete v2 handles and CLI routes return actionable prepare-again failures; live v2 stores are not migrated and may expire.

Commits retain normal hooks, exact staging, write-tree, parent/tree/path/message postconditions, CAS rollback for a rejected runtime commit, partial completed commits, and leftovers. Hook identity is never claimed; only observable hook effects and postconditions are reported. Abandoned claims/locks and consumed handles fail closed and require fresh preparation.

## Output Contract

- Before execute: repository basename, current branch/HEAD abbreviation, current/create branch action, ordered titles, exact paths, body presence/bytes, and file/commit totals.
- Success: status, branch effect, OID/title per commit, counts, empty leftovers.
- Every result distinguishes verified `completed` commits, active `stoppedAt` unit or null, later `notAttempted` units, exact intended `outstandingPaths`, and broader observed `leftovers`.
- Partial/failure: report those concepts, observed effects, and fresh-prepare recovery without implying that an unattempted unit failed.
- Never repeat bodies or expose payload/request/snapshot/fingerprint internals.
