# Flow Commit Specification

## Requirements

### Requirement: Ephemeral Inspection and Explicit Groups

Inspection MUST NUL-safely report every change without mutation or persistence. Plan tokens and lifecycle adapters MUST NOT be used. The skill/agent MUST supply ordered groups; runtime MUST NOT infer them.

#### Scenario: Inspection
- GIVEN any worktree
- WHEN inspected
- THEN root, branch, HEAD, changes, and staging MUST be reported without mutation
- AND a clean worktree MUST yield noop

### Requirement: Exact Snapshot Coverage

Groups MUST be non-empty, disjoint, and cover every snapshot path exactly. Invalid coverage MUST block mutation and identify offending paths.

#### Scenario: Invalid coverage
- GIVEN inexact snapshot coverage
- WHEN validated
- THEN offending paths MUST be reported without mutation

### Requirement: Execute Revalidation

Before mutation, execution MUST revalidate root, branch, HEAD, and coverage against supplied inspection expectations.

#### Scenario: Inspection drift
- GIVEN inspection expectations
- WHEN root, branch, HEAD, or coverage differs
- THEN drift MUST be reported without mutation

### Requirement: Protected Branch Safety

Protected branches MUST select the supplied task branch before staging, without invented names or suffix retries.

#### Scenario: Protected branch
- GIVEN a protected branch and task name
- WHEN executed
- THEN exactly that branch MUST be created and selected

#### Scenario: Unsafe branch
- GIVEN detached HEAD, invalid name, or branch collision
- WHEN validated
- THEN execution MUST fail without staging, commits, or retries

#### Scenario: Current task branch
- GIVEN an unprotected task branch
- WHEN executed
- THEN it MUST continue without branch creation

### Requirement: Commit Messages

Each group MUST have `type(scope): outcome` title. The skill/agent MUST include a body only when it adds non-redundant context. Runtime MUST validate title and body structure, preserve supplied bodies exactly, and MUST NOT assess redundancy.

#### Scenario: Body handling
- GIVEN a valid title and body structure
- WHEN committed
- THEN runtime MUST preserve the body exactly without semantic assessment

#### Scenario: Invalid message
- GIVEN an invalid title or body structure
- WHEN validated
- THEN execution MUST block before staging

### Requirement: Exact Index Handling

Staging MUST use exact argv-safe paths. Any pre-staged path, including partially staged intended paths, MUST block pre-mutation.

#### Scenario: Existing staging
- GIVEN any pre-staged path
- WHEN validated
- THEN the unchanged index and intentional-unstage retry instruction MUST be returned

### Requirement: Ordered and Bounded Execution

Groups MUST execute in order. Earlier commits MUST survive. Restoration MUST affect only the failing uncommitted index operation.

#### Scenario: Later failure
- GIVEN group one commits and group two fails
- WHEN stopped
- THEN commit one MUST remain and only group two's index MUST be restored

### Requirement: Drift Verification

The workflow MUST detect HEAD drift and unexpected staged, committed, hook-added, or external paths. Commits MUST exactly match groups.

#### Scenario: Drift
- GIVEN unexpected execution or hook state
- WHEN verified
- THEN execution MUST stop, report drift, and skip later groups

### Requirement: Structured Outcomes

Output MUST classify noop, success, blocked, drift, partial, or failure and report commits, remaining groups, leftovers, and recovery. Success MUST commit each snapshot path once without leftovers. Only non-success MAY have leftovers.

#### Scenario: Success
- GIVEN all groups commit and verify
- WHEN reported
- THEN success MUST contain no remaining groups or leftovers

#### Scenario: Leftovers
- GIVEN non-success with remaining paths
- WHEN reported
- THEN all leftovers MUST appear and completed commits remain

### Requirement: Git-Only Compatibility

`/flow-commit` MUST omit Gentle AI, `planId`, rounds, lineage, lifecycle, topology, heuristics, historical modes, and suffix retry. `/flow-pr` behavior and exports MUST remain unchanged.

#### Scenario: Compatibility
- GIVEN simplified surfaces
- WHEN checked
- THEN removed concepts MUST be absent and `/flow-pr` preserved

### Requirement: Dirty Worktree Preservation

Reconciliation MUST preserve unrelated files and locks.

#### Scenario: Unrelated edits
- GIVEN unrelated files
- WHEN assets reconcile
- THEN unrelated changes MUST remain unmodified
