# Flow portfolio integration (T7)

- [x] Reconcile T6 to complete from merge evidence on updated `main` (`d82763a` contains `187d1f9`).
- [x] Add strict-TDD contract coverage for packaged registry and portfolio documentation. RED: the focused portfolio command exited 1 with 6 expected failures for the absent packaged/provenanced registry and incomplete portfolio documentation. GREEN: the unchanged command later passed 34/34. TRIANGULATE/negative coverage: invalid or omitted registry publication remained fail-closed through package, Pi, OpenCode, migration, and asset-generation assertions; the first full-suite run additionally exposed missing cross-`core.autocrlf` byte preservation, and the next run exposed the stale manifest expectation before both were corrected.
- [x] Publish the registry through package and host adapter assets; complete migration/docs.
- [x] Regenerate provenance locks and pass focused/full/package verification. Focused portfolio verification passed 56 tests with 1 Windows executable-mode skip; `node --test` passed 356 tests with 7 Windows capability skips; root/Pi/OpenCode provenance verification passed at generation `e16e59145b1aebc499f560afb61b089a20ad4c73c242e3e898d885a26eda3281`; `npm pack --dry-run --json` passed with 69 entries; `git diff --check` passed with CRLF conversion warnings only.
- [x] Obtain independent verification and record T7 as verified awaiting merge. Independent re-verification PASS confirmed acceptance, non-goals, strict-TDD evidence, 173-line review boundary, package/provenance coherence, and exact skips.

## Constraints

- Implement only roadmap task T7.
- No commit, push, PR, publish, release, install, deploy, or live reconciliation.
- Keep the deliverable review surface at <=400 changed lines unless an explicit roadmap size exception is recorded before review.
- Preserve host-neutral core behavior and host-native approval boundaries.
