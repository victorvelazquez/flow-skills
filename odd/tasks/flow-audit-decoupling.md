# Flow Audit Decoupling (T6)

- [x] Reconcile T5 as complete from merge commit `70253f0` containing `7795a76`.
- [x] Add strict-TDD coverage for advisory-only audit output, non-authoritative optional cache, and isolated host-approved fixes.
- [x] Implement the T6 audit/fix boundary and publish coherent Pi/OpenCode/package assets without implicit mutation or authority claims.
- [x] Regenerate provenance, run focused/full/package checks, obtain independent verification, and record T6 as verified awaiting merge.

## Constraints

- Exactly one roadmap slice: T6.
- No commit, push, PR, install, deploy, reconcile, publish, or release.
- One writer only.
- Preserve a strict separation between read-only audit evidence and separately authorized fix mutation.
- Keep the portable core free of approval, native-review, delivery, and Gentle authority.
- Stay within 400 changed lines or record an explicit `size:exception` before review.
