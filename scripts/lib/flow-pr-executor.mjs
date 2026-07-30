import { spawnSync } from "node:child_process";
import { blankEffects, canonical, repoIdentity, validatePr, validateRequest } from "./flow-pr-contracts.mjs";
import { inspect } from "./flow-pr-inspection.mjs";

const PROTECTED = new Set(["main", "master", "dev", "develop", "development"]);

function result(status, phase, snapshot, effects, extra = {}) {
  const exit = { inspect: 0, success: 0, noop: 0, blocked: 2, drift: 3, partial: 4, failure: 5 }[status];
  return { schema: "flow-pr/result-v1", status, exit, phase, snapshot, effects, pr: extra.pr || null, blocker: extra.blocker || null, error: extra.error || null, recovery: extra.recovery || null };
}
function recovery(code, message) { return { code, message, requiresFreshInspection: true }; }
function block(phase, snapshot, effects, code, message, pr = null, recover = true) { return result("blocked", phase, snapshot, effects, { pr, blocker: { code, message }, recovery: recover ? recovery("prepare-again", "Prepare and approve a fresh request.") : null }); }
function drift(phase, expected, observed, facts, effects) { return result("drift", phase, { expected, observed, facts }, effects, { blocker: { code: "snapshot-drift", message: "The approved snapshot no longer matches current repository authority." }, recovery: recovery("prepare-again", "Prepare and approve a fresh request.") }); }
function run(command, args, options = {}) { const value = spawnSync(command, args, { cwd: options.cwd, input: options.input, encoding: "utf8", shell: false, env: options.env || process.env }); return { ok: value.status === 0 && !value.error, stdout: value.stdout || "", stderr: value.stderr || value.error?.message || "" }; }
function effect(state, before, after) { return { state, before, after }; }
function unknownPrEffects(effects) {
  for (const name of ["prCreate", "prUpdate", "labels"]) if (effects[name].state !== "not-attempted") effects[name].state = "unknown";
}
function mutationFailureStatus(effects) {
  return Object.values(effects).some(({ state }) => state === "confirmed" || state === "unknown") ? "partial" : "failure";
}
function boundedInspectionError(error) {
  const message = String(error?.message || "Fresh inspection could not establish authority.")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\b(?:https?|ssh):\/\/[^\s]+/gi, "[redacted-url]")
    .slice(0, 512);
  return { code: error?.code || "inspection-failure", message };
}
function gh(env) { return env.FLOW_PR_GH_SCRIPT ? process.execPath : env.FLOW_PR_GH || "gh"; }
function ghArgs(env, args) { return env.FLOW_PR_GH_SCRIPT ? [env.FLOW_PR_GH_SCRIPT, ...args] : args; }
function sameRepo(left, right) { return repoIdentity(left) === repoIdentity(right); }
function immutableAuthority(snapshot) {
  const value = structuredClone(snapshot); delete value.identity; delete value.upstream; delete value.relation; delete value.push.remoteHeadOid; return value;
}
function postconditions(pr, request, snapshot) {
  if (!pr || pr.state !== "open" || !sameRepo(pr.repository, request.delivery.target) || pr.head.owner !== request.delivery.head.owner || pr.head.ref !== request.delivery.head.ref || pr.head.oid !== snapshot.headOid || pr.base.ref !== snapshot.base.ref || pr.base.oid !== snapshot.base.oid || pr.title !== request.pr.title || pr.body !== request.pr.body || pr.draft !== request.pr.draft) return false;
  const expected = new Set(request.expected.snapshot.pr.exact?.labels || []); for (const label of request.pr.labels.remove) expected.delete(label); for (const label of request.pr.labels.add) expected.add(label);
  return [...expected].sort().join("\0") === [...pr.labels].sort().join("\0");
}
function inspectNow(request, cwd, env) {
  const response = inspect({ cwd, baseRef: request.expected.snapshot.base.ref, pushRemote: request.delivery.push.remote, env });
  return response.status === "inspect" ? { facts: response.snapshot.facts, error: null } : { facts: null, error: boundedInspectionError(response.error) };
}
function verifyPr(cwd, env, target, number) {
  const response = run(gh(env), ghArgs(env, ["pr", "view", String(number), "--repo", `${target.owner}/${target.name}`, "--json", "number,url,state,isDraft,headRefOid,headRefName,headRepositoryOwner,baseRefName,baseRefOid,title,body,labels"]), { cwd, env });
  if (!response.ok) throw new Error(`GitHub postcondition verification failed: ${response.stderr || response.stdout}`);
  const value = JSON.parse(response.stdout);
  return validatePr({ number: value.number, url: value.url, state: String(value.state || "").toLowerCase(), draft: Boolean(value.isDraft), repository: target, head: { owner: value.headRepositoryOwner?.login, ref: value.headRefName, oid: value.headRefOid }, base: { ref: value.baseRefName, oid: value.baseRefOid }, title: value.title, body: value.body, labels: (value.labels || []).map((label) => label.name).sort() });
}

export function failureResult(error) {
  return result("failure", "preflight", { expected: null, observed: null, facts: null }, blankEffects(), { error: { code: error.code || "runtime-failure", message: error.message }, recovery: recovery("prepare-again", "Prepare and approve a fresh request before retrying.") });
}

export function execute(requestValue, { cwd = process.cwd(), env = process.env } = {}) {
  let request;
  try { request = validateRequest(requestValue); }
  catch (error) { return result("blocked", "preflight", { expected: null, observed: null, facts: null }, blankEffects(), { blocker: { code: error.code || "invalid-request", message: error.message } }); }
  const effects = blankEffects(); const expected = request.expected.snapshot;
  const inspection = inspectNow(request, cwd, env); const facts = inspection.facts;
  if (!facts) return result("failure", "preflight", { expected: expected.identity, observed: null, facts: null }, effects, { error: inspection.error, recovery: recovery("prepare-again", "Prepare and approve a fresh request.") });
  if (!facts.clean || facts.detached || !facts.committed || facts.mergeState !== "none" || !facts.branch || PROTECTED.has(facts.branch)) return block("preflight", { expected: expected.identity, observed: facts.identity, facts }, effects, "unsafe-local-state", "A clean, committed, non-protected task branch is required.", null, true);
  const binding = sameRepo(facts.target, request.delivery.target) && sameRepo(facts.push.repository, request.delivery.push.repository) && facts.push.remote === request.delivery.push.remote && facts.head.owner === request.delivery.head.owner && facts.head.ref === request.delivery.head.ref && sameRepo(facts.head.repository, request.delivery.head.repository);
  if (!binding || facts.identity !== expected.identity) return drift("preflight", expected.identity, facts.identity, facts, effects);
  if (request.delivery.mode === "same-repo" && (!sameRepo(request.delivery.target, request.delivery.push.repository) || !sameRepo(request.delivery.target, request.delivery.head.repository) || request.delivery.head.owner !== request.delivery.target.owner)) return block("preflight", { expected: expected.identity, observed: facts.identity, facts }, effects, "delivery-mismatch", "Same-repository delivery has incompatible bindings.");
  if (request.delivery.mode === "fork" && sameRepo(request.delivery.target, request.delivery.push.repository)) return block("preflight", { expected: expected.identity, observed: facts.identity, facts }, effects, "delivery-mismatch", "Fork delivery must bind a distinct push repository.");
  if (facts.upstream && (facts.upstream.remote !== request.delivery.push.remote || facts.upstream.ref !== facts.branch)) return block("preflight", { expected: expected.identity, observed: facts.identity, facts }, effects, "upstream-mismatch", "The current upstream does not match the approved push destination.");

  let current = facts;
  if (request.expected.intent.push === "publish") {
    if (["behind", "diverged", "unknown"].includes(facts.relation.divergence)) return block("push", { expected: expected.identity, observed: facts.identity, facts }, effects, "non-fast-forward", "The remote branch cannot be proven to fast-forward safely.");
    const upstreamExact = facts.upstream?.remote === request.delivery.push.remote && facts.upstream.ref === facts.branch;
    if (facts.relation.divergence !== "equal" || !upstreamExact) {
      effects.push = effect("attempted", facts.push.remoteHeadOid, facts.headOid);
      const pushed = run("git", ["push", "--set-upstream", request.delivery.push.remote, `HEAD:refs/heads/${facts.branch}`], { cwd, env });
      if (!pushed.ok) { effects.push.state = "unknown"; return result("partial", "push", { expected: expected.identity, observed: facts.identity, facts }, effects, { error: { code: "push-unknown", message: pushed.stderr || pushed.stdout }, recovery: recovery("prepare-again", "The push may have completed; prepare and approve again.") }); }
      const checkedInspection = inspectNow(request, cwd, env); const checked = checkedInspection.facts;
      if (!checked || checked.push.remoteHeadOid !== facts.headOid || !checked.upstream || checked.upstream.remote !== request.delivery.push.remote || checked.upstream.ref !== facts.branch) { effects.push.state = "unknown"; return result("partial", "push", { expected: expected.identity, observed: checked?.identity || null, facts: checked }, effects, { error: checkedInspection.error || { code: "push-unverified", message: "Push or upstream postconditions could not be verified." }, recovery: recovery("prepare-again", "Prepare and approve again before retrying.") }); }
      effects.push = effect("confirmed", facts.push.remoteHeadOid, checked.push.remoteHeadOid); effects.upstream = effect("confirmed", facts.upstream, checked.upstream);
      if (canonical(immutableAuthority(expected)) !== canonical(immutableAuthority(checked))) return result("partial", "push", { expected: expected.identity, observed: checked.identity, facts: checked }, effects, { blocker: { code: "post-push-authority-drift", message: "Immutable repository or pull request authority changed during push." }, recovery: recovery("prepare-again", "The push is preserved; prepare and approve the observed authority before any PR mutation.") });
      current = checked;
    }
  } else if (facts.push.remoteHeadOid !== facts.headOid || !facts.upstream || facts.upstream.remote !== request.delivery.push.remote || facts.upstream.ref !== facts.branch) return block("preflight", { expected: expected.identity, observed: facts.identity, facts }, effects, "existing-not-verified", "verify-existing requires exact remote and upstream state.");

  try {
    let pr = current.pr.exact;
    if (current.pr.availability === "ambiguous") return block("reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, "pr-ambiguous", current.pr.reason);
    if (current.pr.availability === "unavailable") return block("reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, "pr-unavailable", current.pr.reason || "PR authority is unavailable.");
    if (pr && (pr.state !== "open" || !sameRepo(pr.repository, request.delivery.target) || pr.head.owner !== request.delivery.head.owner || pr.head.ref !== request.delivery.head.ref || pr.head.oid !== current.headOid || pr.base.ref !== current.base.ref || pr.base.oid !== current.base.oid)) return block("reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, "pr-incompatible", "The matching pull request is closed, merged, or has incompatible authority.", pr);
    if (!pr) {
      effects.prCreate = effect("attempted", null, null);
      if (request.pr.labels.add.length) effects.labels = effect("attempted", [], null);
      const args = ["pr", "create", "--repo", `${request.delivery.target.owner}/${request.delivery.target.name}`, "--base", current.base.ref, "--head", `${request.delivery.head.owner}:${request.delivery.head.ref}`, "--title", request.pr.title, "--body-file", "-"];
      if (request.pr.draft) args.push("--draft"); for (const label of request.pr.labels.add) args.push("--label", label);
      const created = run(gh(env), ghArgs(env, args), { cwd, env, input: request.pr.body });
      if (!created.ok) { unknownPrEffects(effects); return result(mutationFailureStatus(effects), "reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, { error: { code: "pr-create-unknown", message: created.stderr || created.stdout }, recovery: recovery("prepare-again", "The pull request mutation may have completed; prepare and approve again.") }); }
      const url = created.stdout.trim(); const number = url.match(/\/(\d+)\/?$/)?.[1]; if (!number) throw new Error("GitHub did not return a pull request URL."); pr = verifyPr(cwd, env, request.delivery.target, number); effects.prCreate = effect("confirmed", null, pr); if (request.pr.labels.add.length) effects.labels = effect("confirmed", [], pr.labels);
    } else {
      const changes = [];
      if (pr.title !== request.pr.title) changes.push("title"); if (pr.body !== request.pr.body) changes.push("body"); if (pr.draft !== request.pr.draft) changes.push("draft");
      const expectedLabels = new Set(pr.labels); request.pr.labels.remove.forEach((label) => expectedLabels.delete(label)); request.pr.labels.add.forEach((label) => expectedLabels.add(label)); if ([...expectedLabels].sort().join("\0") !== pr.labels.join("\0")) changes.push("labels");
      if (changes.some((field) => !request.pr.updateExisting.includes(field))) return block("reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, "update-not-authorized", `Approved request does not authorize: ${changes.join(", ")}.`, pr);
      if (changes.length === 0) return result("noop", "verify", { expected: expected.identity, observed: current.identity, facts: current }, effects, { pr });
      effects.prUpdate = effect("attempted", pr, null);
      if (changes.includes("labels")) effects.labels = effect("attempted", pr.labels, null);
      const editable = changes.filter((field) => field !== "draft");
      if (editable.length) {
        const args = ["pr", "edit", String(pr.number), "--repo", `${request.delivery.target.owner}/${request.delivery.target.name}`]; if (changes.includes("title")) args.push("--title", request.pr.title); if (changes.includes("body")) args.push("--body-file", "-"); if (changes.includes("labels")) { request.pr.labels.add.forEach((label) => args.push("--add-label", label)); request.pr.labels.remove.forEach((label) => args.push("--remove-label", label)); }
        const edited = run(gh(env), ghArgs(env, args), { cwd, env, input: changes.includes("body") ? request.pr.body : undefined });
        if (!edited.ok) { unknownPrEffects(effects); return result(mutationFailureStatus(effects), "reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, { error: { code: "pr-update-unknown", message: edited.stderr || edited.stdout }, recovery: recovery("prepare-again", "Prepare and approve again before retrying.") }); }
      }
      if (changes.includes("draft")) { const readyArgs = request.pr.draft ? ["pr", "ready", String(pr.number), "--undo", "--repo", `${request.delivery.target.owner}/${request.delivery.target.name}`] : ["pr", "ready", String(pr.number), "--repo", `${request.delivery.target.owner}/${request.delivery.target.name}`]; const ready = run(gh(env), ghArgs(env, readyArgs), { cwd, env }); if (!ready.ok) throw new Error(`Draft transition could not be verified: ${ready.stderr || ready.stdout}`); }
      pr = verifyPr(cwd, env, request.delivery.target, pr.number); effects.prUpdate = effect("confirmed", effects.prUpdate.before, pr); if (changes.includes("labels")) effects.labels = effect("confirmed", effects.prUpdate.before.labels, pr.labels);
    }
    if (!postconditions(pr, request, current)) { unknownPrEffects(effects); return result(mutationFailureStatus(effects), "verify", { expected: expected.identity, observed: current.identity, facts: current }, effects, { pr, error: { code: "postcondition-failed", message: "GitHub PR postconditions did not match the approved request." }, recovery: recovery("prepare-again", "Prepare and approve again before retrying.") }); }
    return result("success", "verify", { expected: expected.identity, observed: current.identity, facts: current }, effects, { pr });
  } catch (error) { unknownPrEffects(effects); return result(mutationFailureStatus(effects), "reconcile", { expected: expected.identity, observed: current.identity, facts: current }, effects, { error: { code: "pr-unknown", message: error.message }, recovery: recovery("prepare-again", "Prepare and approve again before retrying.") }); }
}
