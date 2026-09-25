# Host Adapter Port Contract

Each host adapter presents a workflow from `core/workflows.json` without changing its shared outcome, safety posture, or runtime contract. This document defines stages, not a universal permission API.

## Neutral vocabulary and boundaries

- **Analysis result** is a non-mutating account of what the workflow examined and concluded within its declared scope.
- **Finding** is a scoped, referenceable conclusion from an analysis result.
- **Evidence** is scoped, referenceable support for a finding. Findings and evidence communicate their confidence and limitations.
- **Proposal** is a non-mutating suggested next action. Analysis and proposals are non-mutating and never approval.
- **Mutation result** is the verified outcome of an executed mutation, including its scope, status, and any limitations.

Mutation requires host-native approval and revalidation of workflow-owned immutable input before execution. Exception: only manual `/flow-commit` and `/flow-pr` invocation authorizes their respective local commit and PR push/create/update; no second approval is required. All other workflows retain their host-native gate. Adapters own interaction and presentation. Shared Flow does not prescribe universal permission APIs, approval tokens, review transactions, host commands, workflow taxonomies, storage models, or serialized schemas.

## Required stages

1. **Discover** a workflow only when the registry and the host manifest both claim support.
2. **Load** the exact shared skill and required resources from the same verified generation.
3. **Resolve** every runtime and resource path from the installed package or managed adapter root, never from the current directory or another host.
4. **Collect** user intent as data and pass values only through documented runtime inputs.
5. **Clarify** missing or ambiguous intent through the host's verified interaction mechanism for workflows that require it. If that mechanism is unavailable, return `unavailable` without mutation. Flow PR instead stops on base/fork ambiguity and requests a fresh invocation with explicit destination.
6. **Prepare** and present the shared runtime's bounded preview when a runtime provides one.
7. **Authorize** a mutation through a host-native gate, except the two manual invocation-authorized workflows named above. Discovery, invocation of other workflows, previous answers, and adapter metadata never grant consent.
8. **Execute** only the authorized immutable handle, plan, or request. A stale identity discards that authority and requires fresh preparation; Flow Commit/PR require a fresh manual invocation.
9. **Present** verified results and explicit blockers. Capability limitations are not successful enforcement.

## Adapter invariants

- An adapter claims only registry workflows that its verified capabilities can express.
- Shared skills own workflow meaning, runtime inputs and outputs, safety invariants, and result semantics.
- Adapters own native discovery, routing, clarification, approval, permission, and presentation behavior.
- An unavailable required clarification or approval capability stops the affected mutation clearly; Flow Commit/PR need no second gate.
- Adapters do not pass a generic approval flag as proof of consent; the runtime revalidates its own immutable execution authority and postconditions.
- Hosts do not gain ownership of configuration, credentials, caches, sessions, or unrelated files through a workflow claim.
