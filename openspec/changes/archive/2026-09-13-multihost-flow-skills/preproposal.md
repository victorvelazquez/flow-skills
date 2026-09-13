# Pre-proposal: Multihost Flow Skills

## Confirmed product decisions

- Pi is the primary platform.
- OpenCode remains supported.
- The Git repository is the single source of truth.
- Architecture uses a shared host-neutral core with host-specific adapters.
- Pi distribution uses package resources rather than copying assets into global or project directories.
- Live-host import remains available only as an exceptional explicit reconciliation workflow with preview, comparison, and human approval; it is never automatic authority.
- Host adapters own interactive clarification, confirmation, and permission UX. The shared core produces immutable plans and validates execution evidence without assuming a host permission model.
- The first multihost version may remove legacy aliases and inconsistent commands rather than promising strict behavioral parity with every current OpenCode surface.

## Research selection

External research is unselected. Current repository evidence, Pi runtime documentation already captured during exploration, and recovered Engram audit/reconciliation records are sufficient for proposal scope.

## Required assumptions

- Existing deterministic JavaScript runtimes and transaction safeguards should be preserved unless a later design proves a host-neutral replacement is safer.
- Each host needs distinct adapter assets and integrity/provenance identity while sharing canonical workflow semantics.
- Host-owned configuration, secrets, credentials, caches, and sessions remain outside managed ownership.

## Proposal constraints

- No blind synchronization in either direction.
- No OpenCode syntax or permission claims in the shared core.
- No Pi-specific harness assumptions in portable runtime contracts.
- Legacy cleanup must be explicit in proposal scope and covered by migration documentation.
- Review workload remains capped at 400 changed lines unless the user later selects chaining or explicitly accepts `size:exception`.
