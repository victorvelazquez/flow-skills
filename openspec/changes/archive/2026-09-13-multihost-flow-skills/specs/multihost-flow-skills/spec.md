# Multihost Flow Skills Specification

## Purpose

Provide one repository-authoritative Flow Skills product for Pi and OpenCode. Pi is the primary documented experience; both supported hosts deliver the same supported workflow outcomes while retaining their native interaction models.

## Requirements

### Requirement: Repository Authority

The system MUST treat the reviewed repository generation as the default and automatic authority for Flow-managed assets on every supported host. A live-host state MUST be treated as deployment evidence and MUST NOT replace repository content implicitly.

#### Scenario: Deploying a reviewed generation

- GIVEN a repository generation and a supported host destination
- WHEN the system prepares or applies a managed deployment
- THEN the managed content is derived from the repository generation
- AND live-host content is not selected as the source of managed content.

### Requirement: Shared Host-Neutral Semantics

The system MUST define each supported v1 workflow's meaning, safety posture, and outcome contract once as host-neutral semantics. Shared semantics MUST NOT contain OpenCode command syntax, OpenCode path assumptions, OpenCode permission claims, or Pi-specific harness assumptions.

#### Scenario: Comparing the same supported workflow across hosts

- GIVEN Pi and OpenCode both support a Flow workflow
- WHEN a user completes that workflow on either host
- THEN the observable workflow outcome and safety posture conform to the same shared contract
- AND host-specific invocation or presentation differences do not change that contract.

### Requirement: Pi Package-Resource Discovery

The system MUST expose every v1-supported Flow workflow to Pi through declared package resources and MUST document Pi as the primary platform. Pi discovery and use MUST NOT require an OpenCode installation, OpenCode command assets, a live OpenCode asset tree, or OpenCode permission semantics.

#### Scenario: Using Flow Skills in Pi without OpenCode

- GIVEN an environment with the Flow package resources available to Pi and no OpenCode installation or asset directory
- WHEN Pi discovers and invokes a supported Flow workflow
- THEN the workflow is discoverable and usable through the declared package resources
- AND it does not read or require OpenCode-specific assets or behavior.

### Requirement: OpenCode Adapter Compatibility

The system MUST retain OpenCode as a supported host through a distinct OpenCode adapter. The adapter MUST provide the documented supported workflow outcomes using OpenCode-native invocation and interaction behavior. The system MUST clearly fail or document as unavailable any behavior that the verified OpenCode capabilities cannot express.

#### Scenario: Invoking a supported workflow from OpenCode

- GIVEN an OpenCode environment with the supported adapter installed
- WHEN a user invokes a documented supported Flow workflow
- THEN the adapter routes the request through the shared workflow contract
- AND the user receives the documented outcome through OpenCode-native behavior.

### Requirement: Host-Owned Clarification and Approval

The system SHALL leave interactive clarification, confirmation, permission, and result-presentation behavior to the host adapter and its verified capabilities. The shared workflow contract MUST NOT assert a universal host permission model. When required user input or approval cannot be obtained, the adapter MUST stop the affected action clearly rather than infer consent.

#### Scenario: A mutation needs user approval

- GIVEN a supported workflow has produced a mutation plan that requires approval
- WHEN the host can present its native approval interaction
- THEN the host adapter requests approval before execution
- AND the shared workflow contract does not claim that the same interaction exists on another host.

#### Scenario: Approval is unavailable

- GIVEN a mutation requires approval
- WHEN the host cannot obtain the required approval
- THEN the mutation is not executed
- AND the user receives a clear unavailable or declined result.

### Requirement: Distinct Host Ownership and Provenance

The system MUST record distinguishable managed ownership and integrity/provenance identities for Pi and OpenCode. Each host identity MUST be traceable to the same canonical repository generation without conflating the hosts' managed destinations or ownership scopes.

#### Scenario: Inspecting two host records for one generation

- GIVEN the same repository generation is prepared for Pi and OpenCode
- WHEN its managed-asset records are inspected
- THEN each record identifies its own host and managed scope
- AND both records identify the canonical repository generation from which they derive.

### Requirement: Preview and Immutable Execution Plans

For every managed mutation, the system MUST provide a preview before mutation. The preview MUST identify the intended changes, managed scope, source generation, and expected integrity/postconditions. The resulting execution plan MUST have an immutable identity, and execution MUST refuse to apply a plan whose identity no longer matches the approved preview. Managed mutation MUST preserve path safety, verified backups, recoverable failure handling, and postcondition verification.

#### Scenario: Applying an approved current plan

- GIVEN a user has approved a previewed plan whose identity is current
- WHEN execution is requested
- THEN only the plan's declared managed changes are applied
- AND the system verifies the required postconditions after the mutation.

#### Scenario: Attempting to apply a stale plan

- GIVEN a previewed plan has changed or its identity cannot be validated
- WHEN execution is requested
- THEN the system MUST NOT mutate the destination
- AND it requires a new preview and approval.

### Requirement: Exceptional Live-Host Reconciliation

The system MUST allow live-host-to-repository reconciliation only as an explicit exceptional workflow. Reconciliation MUST preview host differences, compare them with the canonical repository generation, and require explicit human approval before any repository change. It MUST NOT run automatically as part of discovery, deployment, verification, or ordinary synchronization.

#### Scenario: Reconciling intentional host drift

- GIVEN a maintainer explicitly starts reconciliation for a live host with differences
- WHEN the workflow runs
- THEN it presents the differences against the repository generation and awaits human approval
- AND no repository content changes before that approval.

#### Scenario: Routine deployment encounters host drift

- GIVEN a deployment or verification operation detects live-host differences
- WHEN no explicit reconciliation was requested
- THEN the operation reports or handles the differences within its declared safety contract
- AND it does not import those differences into the repository.

### Requirement: Protection of Host-Owned Files

The system MUST exclude host-owned configuration, secrets, credentials, caches, sessions, and unrelated user files from Flow-managed ownership. A deployment, migration, rollback, or reconciliation MUST NOT overwrite, delete, or claim those files. Any destination outside the declared managed scope MUST remain preserved.

#### Scenario: Updating managed assets beside user configuration

- GIVEN a host destination contains managed Flow assets and host-owned or unrelated files
- WHEN the system applies a managed update
- THEN it changes only declared managed assets
- AND host-owned and unrelated files remain unchanged.

### Requirement: Legacy Surface Migration

The system MAY remove or normalize legacy aliases, commands, and advertised behaviors that do not satisfy the multihost v1 contract. Before a removal or incompatible normalization is released, the system MUST publish migration guidance that identifies the affected surface and its retained workflow, replacement, or removal status. Migration MUST NOT blindly replace a host tree.

#### Scenario: Updating from a legacy OpenCode surface

- GIVEN an OpenCode user relies on a legacy alias or inconsistent command affected by the release
- WHEN the user reads the multihost migration guidance
- THEN the guidance identifies whether the behavior is retained, replaced, normalized, or removed
- AND it provides the applicable transition path without instructing blind host-tree replacement.

### Requirement: Cross-Platform Managed-Asset Behavior

The system MUST preserve equivalent managed-asset integrity, path-safety, preview, and unrelated-file-protection outcomes on supported platforms. Platform-specific filesystem limitations MAY be capability-gated, but the system MUST report the limitation and MUST NOT weaken integrity or safety requirements silently. Managed asset bytes MUST remain stable across supported platforms.

#### Scenario: A platform lacks a filesystem capability

- GIVEN a supported platform cannot enforce or observe a filesystem capability required by a platform-specific check
- WHEN verification runs
- THEN the affected check is reported as capability-limited or skipped with its reason
- AND the result is not reported as a passing enforcement of that capability.

### Requirement: Product Contract Verification

The release verification suite MUST cover shared workflow semantics, Pi package-resource discovery, OpenCode adapter compatibility, host-specific ownership/provenance, immutable preview-plan execution, protected host-owned files, legacy migration, and exceptional reconciliation. The canonical command `node --test tests/*.test.mjs` MUST pass for a release candidate; capability-based skips MUST be reported separately and MUST NOT be counted as passes.

#### Scenario: Verifying a release candidate

- GIVEN a release candidate contains the multihost product boundary
- WHEN the canonical test command is run
- THEN contract and integration evidence covers both supported hosts and the stated safety boundaries
- AND the command completes without test failures
- AND any capability-based skips are reported separately from passing tests.
