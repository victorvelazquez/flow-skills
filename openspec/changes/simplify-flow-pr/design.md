# Design: Simplify `/flow-pr`

## Technical Approach

Replace `--auto` with command → `flow-pr-agent` → skill semantic planning → `--inspect` → approved immutable request → `--execute`. No `planId`, journal, persistent state, direct LLM mutation, or Gentle AI adapter remains. Inspection and execute preflight permit only local reads, `git ls-remote`, and read-only `gh` APIs; `git fetch` and any ref, `FETCH_HEAD`, or object-store mutation are forbidden.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Small argv-only executor | Incompatible rewrite | Chosen; deterministic validation and postconditions |
| LLM-only execution | Less code, unsafe nondeterminism | Rejected |
| Prune old state machine | Retains promotion/review/chain complexity | Rejected |
| Same-repo default, explicit fork | More fork bindings | Chosen; never infer forks |
| Optional adapters | Less core convenience | MVP includes none: issue-first, Jira text, playbook sync remain outside core success |

## Data Flow

`command → agent/skill → inspect selected target/base/push/head → approval → execute revalidation → push → PR reconcile → verify → result`

GitHub HTTPS/SSH/scp URLs canonicalize to lowercase `github.com/owner/repo` without `.git`; reject unsupported hosts, credentials, control characters, or ambiguity. Use realpath root/common-dir and `spawnSync`/`execFileSync` with argv, `shell:false`, stdin for JSON/body, and native Windows paths.

## Interfaces / Contracts

Exact JSON shapes; validators reject additional properties:

```ts
type Repo={host:"github.com",owner:string,name:string}; type Remote={name:string,fetch:Repo,push:Repo};
type Pr={number:number,url:string,state:"open"|"closed"|"merged",draft:boolean,repository:Repo,head:{owner:string,ref:string,oid:string},base:{ref:string,oid:string},title:string,body:string,labels:string[]};
type Snapshot={identity:string,root:string,commonDir:string,branch:string|null,headOid:string|null,clean:boolean,mergeState:"none"|"merge"|"rebase"|"cherry-pick"|"revert"|"bisect"|"unknown",detached:boolean,committed:boolean,upstream:null|{remote:string,ref:string},remotes:Remote[],target:Repo,push:{remote:string,repository:Repo,remoteHeadOid:string|null},head:{repository:Repo,owner:string,ref:string,oid:string},base:{repository:Repo,ref:string,oid:string},relation:{ahead:number|null,behind:number|null,divergence:"equal"|"ahead"|"behind"|"diverged"|"unborn"|"unknown"},pr:{availability:"none"|"exact"|"ambiguous"|"unavailable",exact:Pr|null,candidates:Pr[],reason:string|null}};
type Effect<T>={state:"not-attempted"|"attempted"|"confirmed"|"unknown",before:T|null,after:T|null}; type Effects={push:Effect<string>,upstream:Effect<{remote:string,ref:string}>,prCreate:Effect<Pr>,prUpdate:Effect<Pr>,labels:Effect<string[]>};
type Inspection={schema:"flow-pr/inspection-v1",status:"inspect"|"failure",exit:0|5,phase:"inspect",snapshot:{expected:null,observed:string|null,facts:Snapshot|null},effects:Effects,pr:Pr|null,blocker:null|{code:string,message:string},error:null|{code:string,message:string},recovery:null|{code:string,message:string,requiresFreshInspection:true}};
type Request={schema:"flow-pr/request-v1",approved:true,expected:{snapshot:Snapshot,intent:{push:"publish"|"verify-existing",upstream:"set"|"verify"}},delivery:{mode:"same-repo"|"fork",target:Repo,push:{remote:string,repository:Repo},head:{owner:string,ref:string,repository:Repo}},pr:{title:string,body:string,draft:boolean,labels:{add:string[],remove:string[]},updateExisting:("title"|"body"|"draft"|"labels")[]}};
type Result={schema:"flow-pr/result-v1",status:"inspect"|"success"|"noop"|"blocked"|"drift"|"partial"|"failure",exit:0|2|3|4|5,phase:"inspect"|"preflight"|"push"|"reconcile"|"verify",snapshot:{expected:string|null,observed:string|null,facts:Snapshot|null},effects:Effects,pr:Pr|null,blocker:null|{code:string,message:string},error:null|{code:string,message:string},recovery:null|{code:string,message:string,requiresFreshInspection:true}};
```

Canonical JSON of every ordered snapshot field produces `identity`; complete PR facts and sorted complete labels are bound. Any mismatch is `drift`/exit 3. `inspect|success|noop` exit 0; blocked 2; partial 4; failure 5. Every path emits its schema on stdout; stderr is diagnostic only.

Preflight compares remote OIDs without fetching. For an existing differing remote head, ancestry must be provable from already-present objects; otherwise block before push. Absent → explicit normal refspec; equal → no push; proven remote ancestor → normal push; ahead/diverged/non-FF → block; never force. Verify remote OID and requested upstream afterward.

Query the selected target across open, closed, and merged PRs for exact head owner/ref. Multiple candidates block. Closed/merged, base/head/repository mismatch, or inspected-identity mismatch blocks. No candidate creates with explicit draft value. One open compatible PR noops if exact; otherwise only fields listed in `updateExisting` change. Draft transitions are never implicit. Label add/remove sets must be disjoint; apply them against the approved complete set, preserving unrelated approved labels, then verify complete postconditions. Unknown mutation outcomes use `unknown`, return partial/failure, and require fresh inspection. Push→PR failure preserves the branch; no rollback fiction. Exact reruns noop.

## File Changes

| Action | Files |
|---|---|
| Replace/create | `scripts/flow-pr.mjs`; `scripts/lib/flow-pr-{contracts,inspection,executor}.mjs`; command, agent, skill, focused `tests/flow-pr.test.mjs` |
| Delete after caller proof | `scripts/lib/{flow-chain-plan,flow-branch-policy,flow-check-evidence,flow-delivery-config,flow-pr-body,flow-pr-labels,flow-pr-prs,promotion-review-coordinator,review-causal-admission,review-delivery-policy}.mjs`; `tests/{flow-pr-harness,promotion-review-runtime,promotion-review-coordinator,review-delivery-policy,review-causal-admission,flow-chain-plan,flow-delivery-modules}.mjs`; `skills/flow-pr/references/{chain-plan,output-contract}.md` |
| Update | `install.mjs`, agent/install/asset tests, `flow-assets.json`, lock/mirrors, conditional `.gitattributes` |

Agent permits inspect, asks for execute, denies direct commit/push/tag/mutating `gh`, and cannot delegate. `flow-auto-deliver` remains commit-only; `/flow-commit` is unchanged.

## Testing Strategy and Threat Matrix

Use `node:test`, temporary local/bare repositories, and fake `gh`; no real network fetch/push/PR.

| Boundary | Applicability; safe/failure; RED tests |
|---|---|
| Documentation-like paths | N/A: no executable classification |
| Repository selection | Applicable: canonical root only; reject `-C`, relative/foreign roots; all selectors |
| Commit state | Applicable: clean committed task HEAD; reject staged/unstaged/merge/detached |
| Push state | Applicable: exact ref/upstream; first/equal/proven-FF/unknown-ancestry/diverged |
| PR commands | Applicable: owned argv; reject composed/environment-prefixed input; all states, ambiguity, draft, labels, unknown effects |

## Migration / Rollout

Land rewrite and caller-proven deletions atomically; rollback by code revert, never remote rewrite. Current branch remains unpublished. The single-writer PR exceeds 800 changed lines; the maintainer-approved `size:exception` is recorded in Engram `sdd/simplify-flow-pr/delivery` (#6882).

## Open Questions

None. The required `size:exception` was approved before apply; this does not change the design behavior.
