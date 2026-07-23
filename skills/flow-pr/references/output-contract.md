# flow-pr Output Contract

Return execution summary, validated push state, every PR URL/title, managed-label and evidence state, then the separate copy-ready `jiraComment`. Never post Jira comments or create/search GitHub Issues.

Ordinary dry-run returns `planId`, exact-candidate `changeSummary`, and one `create`, `update`, or `noop` action per PR. `changeSummary` includes commit/file counts, changed paths, file stats, breaking changes, deployment/migrations, impact area, and comparison base/range; it is the sole source of truth for generated content.

The ordinary `planId` binds the local candidate plus each existing PR's remote title/body digests, state, head, base, and head OID. Non-dry execution requires that exact identity and revalidates it before push and before any PR mutation. Exact existing PRs are edited through the Flow executor or left as an idempotent noop; they are never recreated. Managed body regions may be replaced, but unowned content must be preserved.

Chain `chainState` contains complete publication records plus optional `flow-pr-chain-finalization/v1`. Finalization persists `inFlight` before readiness and `completed` after reconciliation. Draft failure returns `success:false`, `retryable:true`, the unchanged `actionKey`, and `retry_finalize_chain_tracker`; ambiguous CLI failure may return success when exact GitHub authority proves ready. Repeated completed execution returns `idempotent:true` without another gate or ready call.

On partial failure, return `FLOW_RECOVERY_STATE` with completed steps and remote effects. Never claim missing effects succeeded, rewrite commits, or recommend destructive rollback. Chain retries must reuse the unchanged plan.
