import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ContractError, blankEffects, snapshotWithIdentity, validateOid, validateRef } from "./flow-pr-contracts.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: options.cwd, input: options.input, encoding: "utf8", shell: false, env: options.env || process.env });
  return { ok: result.status === 0 && !result.error, stdout: result.stdout || "", stderr: result.stderr || result.error?.message || "" };
}
function value(cwd, args, label) { const result = run("git", args, { cwd }); if (!result.ok || !result.stdout.trim()) throw new ContractError(`Could not resolve ${label}: ${result.stderr || result.stdout}`, "inspection-unavailable"); return result.stdout.trim(); }
function maybe(cwd, args) { const result = run("git", args, { cwd }); return result.ok ? result.stdout.trim() : null; }
function canonicalPath(value) { const resolved = fs.realpathSync.native(value).replaceAll("\\", "/"); return process.platform === "win32" ? resolved.toLowerCase() : resolved; }

export function parseGitHubRemote(input) {
  const raw = String(input || "").trim();
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) throw new ContractError("Remote URL is empty or contains controls.", "remote-invalid");
  let host; let pathname;
  const scp = raw.match(/^git@([^:/]+):([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (scp) [, host, ...pathname] = scp, pathname = pathname.join("/");
  else {
    let parsed; try { parsed = new URL(raw); } catch { throw new ContractError(`Remote is not a GitHub URL: ${raw}`, "remote-invalid"); }
    if (!["https:", "ssh:"].includes(parsed.protocol) || parsed.username && parsed.username !== "git" || parsed.password || parsed.port || parsed.search || parsed.hash) throw new ContractError(`Remote URL is unsafe: ${raw}`, "remote-invalid");
    host = parsed.hostname; pathname = parsed.pathname.replace(/^\//, "");
  }
  const parts = pathname.replace(/\.git$/i, "").split("/").filter(Boolean);
  if (String(host).toLowerCase() !== "github.com" || parts.length !== 2 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parts[0]) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(parts[1])) throw new ContractError(`Remote must identify github.com owner/repository: ${raw}`, "remote-invalid");
  return { host: "github.com", owner: parts[0], name: parts[1] };
}
function remote(cwd, name) {
  const fetch = run("git", ["config", "--get-all", `remote.${name}.url`], { cwd });
  const push = run("git", ["config", "--get-all", `remote.${name}.pushurl`], { cwd });
  const fetchUrls = fetch.ok ? [...new Set(fetch.stdout.trim().split(/\r?\n/).filter(Boolean))] : [];
  const pushUrls = push.ok ? [...new Set(push.stdout.trim().split(/\r?\n/).filter(Boolean))] : fetchUrls;
  if (fetchUrls.length !== 1 || pushUrls.length !== 1) throw new ContractError(`Remote '${name}' is ambiguous.`, "remote-ambiguous");
  return { name, fetch: parseGitHubRemote(fetchUrls[0]), push: parseGitHubRemote(pushUrls[0]) };
}
function mergeState(cwd, gitDir) {
  const states = [["MERGE_HEAD", "merge"], ["CHERRY_PICK_HEAD", "cherry-pick"], ["REVERT_HEAD", "revert"], ["BISECT_LOG", "bisect"], ["rebase-merge", "rebase"], ["rebase-apply", "rebase"]];
  return states.find(([entry]) => fs.existsSync(path.join(gitDir, entry)))?.[1] || "none";
}
function relation(cwd, remoteOid, head) {
  if (!remoteOid) return { ahead: null, behind: null, divergence: "unborn" };
  if (remoteOid === head) return { ahead: 0, behind: 0, divergence: "equal" };
  const known = run("git", ["cat-file", "-e", `${remoteOid}^{commit}`], { cwd }).ok;
  if (!known) return { ahead: null, behind: null, divergence: "unknown" };
  const count = (range) => {
    const result = run("git", ["rev-list", "--count", range], { cwd });
    const value = Number(result.stdout.trim());
    return result.ok && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const remoteAncestor = run("git", ["merge-base", "--is-ancestor", remoteOid, head], { cwd });
  const headAncestor = run("git", ["merge-base", "--is-ancestor", head, remoteOid], { cwd });
  if (remoteAncestor.ok) return { ahead: count(`${remoteOid}..${head}`), behind: 0, divergence: "ahead" };
  if (headAncestor.ok) return { ahead: 0, behind: count(`${head}..${remoteOid}`), divergence: "behind" };
  return { ahead: count(`${remoteOid}..${head}`), behind: count(`${head}..${remoteOid}`), divergence: "diverged" };
}
function remoteBranchOid(cwd, remoteName, ref, env, label) {
  const result = run("git", ["ls-remote", "--heads", remoteName, `refs/heads/${ref}`], { cwd, env });
  if (!result.ok) throw new ContractError(`Could not inspect remote ${label}: ${result.stderr || result.stdout}`, "remote-unavailable");
  const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1) {
    if (lines.length === 0) throw new ContractError(`Remote ${label} '${ref}' does not exist.`, "remote-ref-missing");
    throw new ContractError(`Remote ${label} '${ref}' is ambiguous.`, "remote-ambiguous");
  }
  const [oid, advertisedRef, ...extra] = lines[0].trim().split(/\s+/);
  if (extra.length || advertisedRef !== `refs/heads/${ref}`) throw new ContractError(`Remote ${label} '${ref}' returned invalid data.`, "remote-invalid");
  return validateOid(oid, `remote ${label} OID`);
}
function ghPr(cwd, repo, owner, ref, env) {
  const command = env.FLOW_PR_GH_SCRIPT ? process.execPath : env.FLOW_PR_GH || "gh";
  const prefix = env.FLOW_PR_GH_SCRIPT ? [env.FLOW_PR_GH_SCRIPT] : [];
  const result = run(command, [...prefix, "pr", "list", "--repo", `${repo.owner}/${repo.name}`, "--head", `${owner}:${ref}`, "--state", "all", "--json", "number,url,state,isDraft,headRefOid,headRefName,headRepositoryOwner,baseRefName,baseRefOid,title,body,labels"], { cwd, env });
  if (!result.ok) throw new ContractError(`GitHub PR inspection is unavailable: ${result.stderr || result.stdout}`, "gh-unavailable");
  let entries; try { entries = JSON.parse(result.stdout); } catch { throw new ContractError("GitHub PR inspection returned invalid JSON.", "gh-invalid-json"); }
  if (!Array.isArray(entries)) throw new ContractError("GitHub PR inspection returned a non-array.", "gh-invalid-json");
  const candidates = entries.map((entry) => ({ number: entry.number, url: entry.url, state: String(entry.state || "").toLowerCase(), draft: Boolean(entry.isDraft), repository: repo, head: { owner: entry.headRepositoryOwner?.login, ref: entry.headRefName, oid: entry.headRefOid }, base: { ref: entry.baseRefName, oid: entry.baseRefOid }, title: entry.title, body: entry.body, labels: (entry.labels || []).map((label) => label.name).sort() }));
  const exact = candidates.length === 1 ? candidates[0] : null;
  return { availability: candidates.length === 0 ? "none" : candidates.length === 1 ? "exact" : "ambiguous", exact, candidates, reason: candidates.length > 1 ? "Multiple pull requests match the requested head." : null };
}

export function inspect({ cwd = process.cwd(), baseRef, pushRemote = "origin", env = process.env } = {}) {
  try {
    validateRef(baseRef, "base ref");
    if (!/^[A-Za-z0-9._-]+$/.test(pushRemote)) throw new ContractError("Push remote is invalid.");
    const root = canonicalPath(value(cwd, ["rev-parse", "--show-toplevel"], "repository root"));
    const commonDir = canonicalPath(value(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"], "Git common directory"));
    if (canonicalPath(cwd) !== root) throw new ContractError("Inspection must run from the canonical repository root.", "root-invalid");
    const branch = maybe(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
    const headOid = maybe(cwd, ["rev-parse", "--verify", "HEAD^{commit}"]);
    const remotes = value(cwd, ["remote"], "remotes").split(/\r?\n/).filter(Boolean).map((name) => remote(cwd, name));
    const push = remotes.find((entry) => entry.name === pushRemote); if (!push) throw new ContractError(`Push remote '${pushRemote}' does not exist.`, "remote-missing");
    const origin = remotes.find((entry) => entry.name === "origin"); if (!origin) throw new ContractError("origin is required for the GitHub target.", "remote-missing");
    const baseOid = remoteBranchOid(cwd, "origin", baseRef, env, "base");
    const status = run("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd });
    if (!status.ok) throw new ContractError(`Could not resolve working tree status: ${status.stderr}`, "inspection-unavailable");
    const clean = status.stdout === "";
    const gitDir = value(cwd, ["rev-parse", "--path-format=absolute", "--git-dir"], "Git directory");
    const upstreamName = maybe(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
    const upstream = upstreamName?.match(/^([^/]+)\/(.+)$/) ? { remote: upstreamName.match(/^([^/]+)\/(.+)$/)[1], ref: upstreamName.match(/^([^/]+)\/(.+)$/)[2] } : null;
    const remoteHead = branch ? run("git", ["ls-remote", "--heads", pushRemote, `refs/heads/${branch}`], { cwd, env }) : null;
    if (remoteHead && !remoteHead.ok) throw new ContractError(`Could not inspect remote branch: ${remoteHead.stderr}`, "remote-unavailable");
    const remoteHeadLines = remoteHead?.stdout.trim().split(/\r?\n/).filter(Boolean) || [];
    if (remoteHeadLines.length > 1) throw new ContractError("Remote branch inspection is ambiguous.", "remote-ambiguous");
    const remoteHeadOid = remoteHeadLines.length ? validateOid(remoteHeadLines[0].trim().split(/\s+/)[0], "remote head OID") : null;
    const target = origin.fetch; const head = { repository: push.push, owner: push.push.owner, ref: branch, oid: headOid };
    const detached = branch === null && headOid !== null; const committed = headOid !== null;
    const pr = branch && committed ? ghPr(cwd, target, head.owner, branch, env) : { availability: "unavailable", exact: null, candidates: [], reason: detached ? "Detached HEAD has no pull request head ref." : "An uncommitted branch has no pull request head OID." };
    const snapshot = snapshotWithIdentity({ root, commonDir, branch, headOid, clean, mergeState: mergeState(cwd, gitDir), detached, committed, upstream, remotes, target, push: { remote: pushRemote, repository: push.push, remoteHeadOid }, head, base: { repository: target, ref: baseRef, oid: baseOid }, relation: committed ? relation(cwd, remoteHeadOid, headOid) : { ahead: null, behind: null, divergence: "unborn" }, pr });
    return { schema: "flow-pr/inspection-v1", status: "inspect", exit: 0, phase: "inspect", snapshot: { expected: null, observed: snapshot.identity, facts: snapshot }, effects: blankEffects(), pr: pr.exact, blocker: null, error: null, recovery: null };
  } catch (error) {
    return { schema: "flow-pr/inspection-v1", status: "failure", exit: 5, phase: "inspect", snapshot: { expected: null, observed: null, facts: null }, effects: blankEffects(), pr: null, blocker: null, error: { code: error.code || "inspection-failure", message: error.message }, recovery: null };
  }
}
