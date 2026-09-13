# Host Adapter Port Contract

Each host adapter presents a workflow from `core/workflows.json` without changing its shared outcome, safety posture, or runtime contract. This document defines stages, not a universal permission API.

## Required stages

1. **Discover** a workflow only when the registry and the host manifest both claim support.
2. **Load** the exact shared skill and required resources from the same verified generation.
3. **Resolve** every runtime and resource path from the installed package or managed adapter root, never from the current directory or another host.
4. **Collect** user intent as data and pass values only through documented runtime inputs.
5. **Clarify** missing or ambiguous intent through the host's verified interaction mechanism. If that mechanism is unavailable, return `unavailable` without mutation.
6. **Prepare** and present the shared runtime's bounded preview when a runtime provides one.
7. **Approve** a mutation through a host-native gate. Discovery, invocation, previous answers, and adapter metadata never grant consent.
8. **Execute** only the approved immutable handle, plan, or request. A stale identity discards approval and returns to preview.
9. **Present** verified results and explicit blockers. Capability limitations are not successful enforcement.

## Adapter invariants

- An adapter claims only registry workflows that its verified capabilities can express.
- Shared skills own workflow meaning, runtime inputs and outputs, safety invariants, and result semantics.
- Adapters own native discovery, routing, clarification, approval, permission, and presentation behavior.
- An unavailable clarification or approval capability stops the affected mutation clearly.
- Adapters do not pass a generic approval flag as proof of consent; the runtime revalidates its own immutable execution authority and postconditions.
- Hosts do not gain ownership of configuration, credentials, caches, sessions, or unrelated files through a workflow claim.
