# Flow Playbook Compare — T3

- [x] Amend the T3 roadmap contract: publish `flow-playbook-compare` as a new read-only workflow, define `.flow/playbook.json` with `playbookPath`, define deterministic JSON comparison results, and reconcile T2.6 merge evidence.
- [x] Implement T3 with strict TDD (RED, GREEN, negative/triangulation, REFACTOR) with the authorized 405 additions + 35 deletions = 440 changed-line size exception.
- RED: `node --test tests/flow-playbook-compare.test.mjs` failed: runtime module was absent.
- GREEN: `node --test tests/flow-playbook-compare.test.mjs` passed: 4/4 after implementation.
- TRIANGULATE: `node --test tests/flow-playbook-compare.test.mjs` passed: 5/5 including environment and malformed-config cases.
- REFACTOR: `node --test tests/flow-playbook-compare.test.mjs` passed: 3/3 after consolidating repeated precedence setup.
- [x] Obtain independent verification of acceptance, read-only behavior, focused/full checks, provenance, and package state.
- [x] Record T3 as `verified awaiting merge` with exact evidence and name T4 only conditionally on merge.

Constraints: one writer; no commit, push, PR, merge, publish, install, deploy, reconcile, or release.
