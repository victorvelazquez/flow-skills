# Flow PR Specification

## Purpose

Deterministic task-branch publication.

## Requirements

### Requirement: Side-effect-free inspection

Inspection MUST be mutation-free and return root; `origin` fetch/push identities; GitHub target; branch/HEAD OID; clean/merge/detached state; nullable upstream; explicit base/OID; ref validity; ahead/behind/divergence; and exact PR number, URL, state/draft, repository, head owner/ref/OID, base, title, body, and labels.

#### Scenario: Inspect an unpublished branch
- GIVEN a clean task branch without upstream
- WHEN inspection runs
- THEN status `inspect`, exit `0`, and the complete nullable snapshot are returned without side effects

#### Scenario: Inspection cannot establish trustworthy facts
- GIVEN missing `gh`, auth, repository/remote identity, invalid JSON, or GitHub timeout
- WHEN inspection runs
- THEN `failure` identifies the unavailable fact and no effects

### Requirement: Explicit immutable request

Execution MUST require an approved request with expected snapshot, target repository, base/head, title, body, optional labels, push/upstream intent, and explicit same-repository or fork mode. Fork MUST NOT be inferred and MUST bind push remote separately from `<owner>:<branch>`. Hostile refs, text, or control characters MUST block without effects.

#### Scenario: Approve a fork publication
- GIVEN an explicit valid fork request
- WHEN execution begins
- THEN push destination and GitHub head are independently bound

### Requirement: Fail-closed execution preconditions

Before mutation, execution MUST revalidate root, branch, HEAD, clean/merge/detached state, remotes, base OID/ref, GitHub repository/head/base, upstream compatibility, and no force/rewrite intent. Only a clean, committed, non-protected task branch MAY proceed.

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

Push success followed by PR failure MUST return `partial` with exact remote effects and fix-forward recovery requiring fresh inspection/request. It MUST NOT compensate, delete, or rewrite commits.

#### Scenario: Rerun after partial push
- GIVEN push succeeded but PR reconciliation failed
- WHEN recovery starts
- THEN fresh inspection precedes approval of a new request

### Requirement: Complete result contract

Every result MUST contain `status`, `exit`, `phase`, snapshot identity, effects, nullable PR, and nullable blocker/error/recovery. `inspect|success|noop` MUST exit `0`; `blocked|drift|partial|failure` MUST exit nonzero. Effects MUST distinguish attempted, confirmed, and unknown outcomes.

#### Scenario: Report an uncertain GitHub outcome
- GIVEN an unconfirmed GitHub mutation
- WHEN execution ends
- THEN a nonzero result reports unknown effects and requires inspection

### Requirement: Narrow command boundary

`/flow-pr` MUST expose no Gentle AI, promotion, release, version, tag, chain, tracker, commit creation, merge, retarget, force, or rewrite surface. Optional issue/type-label policy, Jira text, and playbook sync MUST NOT determine core success. `/flow-commit` SHALL remain unchanged.

#### Scenario: Planning and verification remain non-publishing
- GIVEN implementation or verification on a branch without upstream
- WHEN this change is implemented or verified
- THEN no publication occurs without a separately approved execution request
