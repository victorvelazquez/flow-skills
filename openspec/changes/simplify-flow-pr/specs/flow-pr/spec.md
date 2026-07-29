# Flow PR Specification

## Purpose

Deterministic task-branch publication.

## Requirements

### Requirement: Side-effect-free preparation

Preparation inspection MUST be Git/GitHub mutation-free. It MUST retain the complete canonical snapshot internally and return only compact repository, branch/base, delivery, upstream/divergence, existing-PR metadata, commit subjects, and changed paths. Full snapshot identities and PR bodies MUST be absent unless explicit verbose diagnostics are requested.

#### Scenario: Inspect an unpublished branch
- GIVEN a clean task branch without upstream
- WHEN preparation runs
- THEN `flow-pr/prepare-context-v2` returns compact drafting facts and a runtime-owned temp intent path without Git/GitHub side effects

#### Scenario: Inspection cannot establish trustworthy facts
- GIVEN missing `gh`, auth, repository/remote identity, invalid JSON, or GitHub timeout
- WHEN inspection runs
- THEN `failure` identifies the unavailable fact and no effects

### Requirement: Runtime-owned immutable request

The agent MUST write only `flow-pr/intent-v2` to the runtime-created standard-temp `intentPath`. Final preparation MUST revalidate authority, create `flow-pr/request-v2` internally, and return a compact approval summary plus digest-bound handle. Fork MUST NOT be inferred and MUST bind push remote separately from `<owner>:<branch>`. Hostile refs, text, controls, unsupported custom temp roots, or unsafe paths MUST block without effects.

#### Scenario: Approve a fork publication
- GIVEN explicit valid fork intent
- WHEN execution begins
- THEN push destination and GitHub head are independently bound

### Requirement: Fail-closed execution preconditions

Before mutation, execution MUST revalidate root, branch, HEAD, clean/merge/detached state, remotes, base OID/ref, GitHub repository/head/base, upstream compatibility, and no force/rewrite intent. Only a clean, committed, non-protected task branch MAY proceed.

Execution MUST atomically create an exclusive claim before request reading, reinspection, or mutation. Concurrent reuse and abandoned claims MUST fail closed and require fresh preparation; claims MUST NOT be reclaimed or blindly retried.

#### Scenario: Snapshot or authority drift
- GIVEN changed HEAD, remote, upstream, moved base, or deleted base
- WHEN execution revalidates
- THEN `drift` reports changed facts without effects

#### Scenario: Unsafe local state
- GIVEN protected/detached branch, merge, dirt, or no committed task branch
- WHEN execution revalidates
- THEN `blocked` performs no mutation

### Requirement: Exact non-force push

Execution MUST push only the branch and establish upstream. Upstream mismatch, divergence, or non-fast-forward MUST block without force, rewrite, merge, retarget, or compensation.

#### Scenario: Publish branch safely
- GIVEN valid fast-forward publication
- WHEN push is requested
- THEN the exact branch and upstream are verified remotely

### Requirement: Exact PR reconciliation and verification

Execution MUST create when none matches; noop an exact compatible PR whose content matches; or update only authorized title, body, and labels. It MUST preserve unrelated labels, block duplicate/ambiguous/incompatible PRs or label drift, and verify repository, base, head/ref/OID, content, labels, URL, and number through GitHub after mutation.

#### Scenario: Reconcile exact PR
- GIVEN zero or one compatible exact PR
- WHEN reconciliation runs
- THEN it creates, noops, or updates only authorized fields and returns verified URL/number

#### Scenario: Duplicate authority
- GIVEN duplicate, ambiguous, or incompatible PRs
- WHEN reconciliation runs
- THEN `blocked` performs no PR mutation

### Requirement: Partial recovery

Push success followed by PR failure MUST return `partial` with compact effect states and fix-forward recovery requiring fresh preparation and approval. It MUST NOT compensate, delete, or rewrite commits.

#### Scenario: Rerun after partial push
- GIVEN push succeeded but PR reconciliation failed
- WHEN recovery starts
- THEN fresh preparation precedes a new approval

### Requirement: Complete result contract

Every default result MUST contain `status`, `exit`, `phase`, compact effect states, compact verified PR metadata, publication action, and nullable blocker/error/recovery. It MUST NOT contain PR bodies, rich before/after PR objects, or full snapshots. `success|noop` MUST exit `0`; `blocked|drift|partial|failure` MUST exit nonzero. Explicit verbose diagnostics MAY include internal snapshot facts.

#### Scenario: Report an uncertain GitHub outcome
- GIVEN an unconfirmed GitHub mutation
- WHEN execution ends
- THEN a nonzero result reports unknown effect states and requires fresh preparation

### Requirement: Narrow command boundary

`/flow-pr` MUST expose no Gentle AI, promotion, release, version, tag, chain, tracker, commit creation, merge, retarget, force, or rewrite surface. Optional issue/type-label policy, Jira text, and playbook sync MUST NOT determine core success. `/flow-commit` SHALL remain unchanged.

#### Scenario: Planning and verification remain non-publishing
- GIVEN implementation or verification on a branch without upstream
- WHEN this change is implemented or verified
- THEN no publication occurs without the one approved claimed execution handle
