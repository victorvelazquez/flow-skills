# Design: Simplify `/flow-pr`

## Technical Approach

Replace `--auto` with command → `flow-pr-agent` → compact prepare context → runtime-owned semantic intent file → approval summary → claimed execute handle. No `planId`, journal, persistent state, direct LLM Git/GitHub mutation, or Gentle AI adapter remains. Preparation and execute preflight permit only local reads, `git ls-remote`, and read-only `gh` APIs; `git fetch` and any ref, `FETCH_HEAD`, or object-store mutation are forbidden.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Runtime-owned prepare/handle executor | Incompatible rewrite | Chosen; compact output, deterministic validation, and postconditions |
| LLM-only execution | Less code, unsafe nondeterminism | Rejected |
| Prune old state machine | Retains promotion/review/chain complexity | Rejected |
| Same-repo default, explicit fork | More fork bindings | Chosen; never infer forks |
| Optional adapters | Less core convenience | MVP includes none: issue-first, Jira text, playbook sync remain outside core success |

## Data Flow

`command → agent/skill → prepare compact facts → write small intent to owned temp path → finalize approval summary → one execute permission → atomic handle claim → revalidation → push → PR reconcile → verify → compact result`

GitHub HTTPS/SSH/scp URLs canonicalize to lowercase `github.com/owner/repo` without `.git`; reject unsupported hosts, credentials, control characters, or ambiguity. Use realpath root/common-dir and `spawnSync`/`execFileSync` with argv, `shell:false`, stdin only for `gh --body-file -`, and native Windows paths. Semantic intent is written only to runtime-created `intent.json` under a standard OS temp root with path-scoped agent permission. Custom temp roots fail early with `temp-root-unsupported` rather than broadening write access.

## Interfaces / Contracts

Exact JSON shapes; validators reject additional properties:

```ts
type Repo={host:"github.com",owner:string,name:string}; type Remote={name:string,fetch:Repo,push:Repo};
type Pr={number:number,url:string,state:"open"|"closed"|"merged",draft:boolean,repository:Repo,head:{owner:string,ref:string,oid:string},base:{ref:string,oid:string},title:string,body:string,labels:string[]};
type Snapshot={identity:string,root:string,commonDir:string,branch:string|null,headOid:string|null,clean:boolean,mergeState:"none"|"merge"|"rebase"|"cherry-pick"|"revert"|"bisect"|"unknown",detached:boolean,committed:boolean,upstream:null|{remote:string,ref:string},remotes:Remote[],target:Repo,push:{remote:string,repository:Repo,remoteHeadOid:string|null},head:{repository:Repo,owner:string,ref:string,oid:string},base:{repository:Repo,ref:string,oid:string},relation:{ahead:number|null,behind:number|null,divergence:"equal"|"ahead"|"behind"|"diverged"|"unborn"|"unknown"},pr:{availability:"none"|"exact"|"ambiguous"|"unavailable",exact:Pr|null,candidates:Pr[],reason:string|null}};
type EffectState="not-attempted"|"attempted"|"confirmed"|"unknown";
type PrepareContext={schema:"flow-pr/prepare-context-v2",status:"prepared",phase:"prepare",handle:string,intentPath:string,expiresAt:string,context:{repository:string,root:string,branch:string,base:string,delivery:object,remoteState:string,upstream:object|null,existingPr:object|null,changes:{commits:string[],files:string[]}}};
type Intent={schema:"flow-pr/intent-v2",title:string,body:string,draft:boolean,labels:{add:string[],remove:string[]},updateExisting:("title"|"body"|"draft"|"labels")[],deliveryMode:"same-repo"|"fork",push:"publish"|"verify-existing"};
type InternalRequest={schema:"flow-pr/request-v2",expected:{snapshot:Snapshot,intent:{push:"publish"|"verify-existing",upstream:"set"|"verify"}},delivery:{mode:"same-repo"|"fork",target:Repo,push:{remote:string,repository:Repo},head:{owner:string,ref:string,repository:Repo}},pr:{title:string,body:string,draft:boolean,labels:{add:string[],remove:string[]},updateExisting:("title"|"body"|"draft"|"labels")[]}};
type Preparation={schema:"flow-pr/preparation-v2",status:"prepared",phase:"prepare",handle:string,expiresAt:string,approval:{repository:string,branchToBase:string,action:object,title:string,body:{bytes:number,sha256:string},draft:boolean,labels:object,authorizedUpdateFields:string[],delivery:object}};
type Result={schema:"flow-pr/result-v1",status:"success"|"noop"|"blocked"|"drift"|"partial"|"failure",exit:0|2|3|4|5,phase:"preflight"|"push"|"reconcile"|"verify",effects:Record<string,EffectState>,pr:null|{number:number,url:string,state:string,draft:boolean,title:string,labels:string[]},publication:object|null,blocker:object|null,error:object|null,recovery:object|null,diagnostics?:object};
```

Canonical JSON of every ordered snapshot field produces `identity`; complete PR facts and sorted complete labels are bound internally. The full snapshot and request never appear in default output. `--verbose` is the explicit diagnostics boundary. Any mismatch is `drift`/exit 3. `success|noop` exit 0; blocked 2; partial 4; failure 5. Every path emits its schema on stdout; stderr is diagnostic only.

Preflight compares remote OIDs without fetching. For an existing differing remote head, ancestry must be provable from already-present objects; otherwise block before push. Absent → explicit normal refspec; equal with exact upstream → no push; equal without upstream → normal `--set-upstream`; proven remote ancestor → normal push; ahead/diverged/non-FF → block; never force. Verify remote OID and requested upstream afterward.

Query the selected target across open, closed, and merged PRs for exact head owner/ref. Multiple candidates block. Closed/merged, base/head/repository mismatch, or inspected-identity mismatch blocks. No candidate creates with explicit draft value. One open compatible PR noops if exact; otherwise only fields listed in `updateExisting` change. Draft transitions are never implicit. Label add/remove sets must be disjoint; apply them against the approved complete set, preserving unrelated approved labels, then verify complete postconditions. Before any mutation, execute atomically creates `execute.claim` with exclusive `wx`; concurrent or abandoned claims fail closed and require fresh preparation. Unknown mutation outcomes use `unknown`, return partial/failure, and require fresh preparation. Push→PR failure preserves the branch; no rollback fiction. A fresh preparation against exact completed state noops.

## File Changes

| Action | Files |
|---|---|
| Replace/create | `scripts/flow-pr.mjs`; `scripts/lib/flow-pr-{contracts,inspection,executor}.mjs`; command, agent, skill, focused `tests/flow-pr.test.mjs` |
| Delete after caller proof | `scripts/lib/{flow-chain-plan,flow-branch-policy,flow-check-evidence,flow-delivery-config,flow-pr-body,flow-pr-labels,flow-pr-prs,promotion-review-coordinator,review-causal-admission,review-delivery-policy}.mjs`; removed authority/chain tests and references |
| Update | `install.mjs`, agent/install/asset tests, `flow-assets.json`, lock/mirrors, conditional `.gitattributes` |

Agent permits preparation, restricts edits to standard-temp `flow-pr-request-*/intent.json`, asks once for execute, denies direct commit/push/tag/mutating `gh`, and cannot delegate. `flow-auto-deliver` remains commit-only; `/flow-commit` is unchanged.

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
