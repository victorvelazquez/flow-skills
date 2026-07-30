#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execute, failureResult } from "./lib/flow-pr-executor.mjs";
import { blankEffects, identity, repoIdentity, validateIntent, validateRequest } from "./lib/flow-pr-contracts.mjs";
import { commitDraftingHints, discoverPrTemplate, MAX_COMMIT_BODY_BYTES, MAX_COMMIT_SUBJECT_BYTES, MAX_DRAFTING_COMMITS } from "./lib/flow-pr-drafting.mjs";
import { inspect } from "./lib/flow-pr-inspection.mjs";

const HANDLE_PREFIX = "flow-pr-request-";
const HANDLE_PATTERN = /^([0-9a-f]{64})\.([0-9a-f]{64})$/;
const HANDLE_TTL_MS = 30 * 60 * 1000;
const PROTECTED = new Set(["main", "master", "dev", "develop", "development"]);

function usage(message) {
  throw new Error(`${message}\nUsage: flow-pr --prepare --base <ref> [--push-remote <remote>] [--verbose] | flow-pr --prepare --handle <handle> [--verbose] | flow-pr --execute --handle <handle> [--verbose]`);
}

function parse(argv) {
  const values = new Map(); const flags = new Set();
  const knownFlags = new Set(["--prepare", "--execute", "--verbose"]);
  const knownValues = new Set(["--base", "--push-remote", "--handle"]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (knownFlags.has(value)) { if (flags.has(value)) usage(`Duplicate argument: ${value}`); flags.add(value); continue; }
    if (!knownValues.has(value)) usage(`Unsupported argument: ${value}`);
    if (values.has(value) || index + 1 === argv.length || argv[index + 1].startsWith("--")) usage(`Missing or duplicate value for ${value}`);
    values.set(value, argv[++index]);
  }
  if (flags.has("--prepare") === flags.has("--execute")) usage("Choose exactly one mode.");
  const verbose = flags.has("--verbose");
  if (flags.has("--execute")) {
    if (!values.has("--handle") || values.size !== 1) usage("--execute requires only --handle, with optional --verbose.");
    return { mode: "execute", handle: values.get("--handle"), verbose };
  }
  if (values.has("--handle")) {
    if (values.size !== 1) usage("Intent preparation requires only --handle, with optional --verbose.");
    return { mode: "finalize", handle: values.get("--handle"), verbose };
  }
  if (!values.has("--base")) usage("Initial preparation requires --base.");
  return { mode: "prepare", base: values.get("--base"), pushRemote: values.get("--push-remote") || "origin", verbose };
}

function write(value) { process.stdout.write(`${JSON.stringify(value)}\n`); process.exitCode = value.exit; }
function runGit(args, options = {}) { const value = spawnSync("git", args, { encoding: "utf8", shell: false, ...options }); return value.status === 0 && !value.error ? value.stdout.trim() : ""; }
function expiresAt(createdAt) { return new Date(Date.parse(createdAt) + HANDLE_TTL_MS).toISOString(); }
function compactRepo(repo) { return `${repo.owner}/${repo.name}`; }
function tempRoot() {
  const root = path.resolve(os.tmpdir()); const portable = root.replaceAll("\\", "/");
  const supported = process.platform === "win32" ? /^[A-Za-z]:\/Users\/[^/]+\/AppData\/Local\/Temp$/i.test(portable)
    : portable === "/tmp" || /^\/var\/folders\/[^/]+\/[^/]+\/T$/.test(portable);
  if (!supported) throw Object.assign(new Error(`Unsupported OS temp root '${root}'. Use standard Windows LocalAppData Temp, Linux /tmp, or macOS /var/folders/.../T so Flow PR can retain narrow intent-file permissions.`), { code: "temp-root-unsupported" });
  return root;
}
function safeSnapshot(snapshot) {
  if (!snapshot.clean || snapshot.detached || !snapshot.committed || snapshot.mergeState !== "none" || !snapshot.branch || PROTECTED.has(snapshot.branch)) throw Object.assign(new Error("A clean, committed, non-protected task branch is required."), { code: "unsafe-local-state" });
  if (["ambiguous", "unavailable"].includes(snapshot.pr.availability)) throw Object.assign(new Error(snapshot.pr.reason || "Pull request authority is unavailable."), { code: snapshot.pr.availability === "ambiguous" ? "pr-ambiguous" : "pr-unavailable" });
}

function createStore(name, value) {
  let id; let directory;
  for (let attempts = 0; attempts < 4; attempts += 1) {
    id = randomBytes(32).toString("hex"); directory = path.join(tempRoot(), `${HANDLE_PREFIX}${id}`);
    try { fs.mkdirSync(directory, { mode: 0o700 }); break; } catch (error) { if (error.code !== "EEXIST" || attempts === 3) throw error; }
  }
  const bytes = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: "wx" });
  return `${id}.${identity(bytes.toString("utf8"))}`;
}

function storeDirectory(id) { return path.join(tempRoot(), `${HANDLE_PREFIX}${id}`); }
function assertOwned(entry, kind) {
  const stat = fs.lstatSync(entry);
  if (stat.isSymbolicLink() || (kind === "directory" ? !stat.isDirectory() : !stat.isFile())) throw Object.assign(new Error(`Unsafe ${kind} for preparation handle.`), { code: "handle-unsafe" });
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw Object.assign(new Error(`Preparation ${kind} is not owned by the current user.`), { code: "handle-owner-mismatch" });
}
function readStore(handle, name) {
  const match = HANDLE_PATTERN.exec(handle);
  if (!match) throw Object.assign(new Error("Preparation handle is malformed."), { code: "handle-invalid" });
  const directory = storeDirectory(match[1]); const file = path.join(directory, name);
  if (path.dirname(directory) !== tempRoot()) throw Object.assign(new Error("Preparation handle escaped the OS temp root."), { code: "handle-traversal" });
  try { assertOwned(directory, "directory"); assertOwned(file, "file"); } catch (error) { if (String(error.code || "").startsWith("handle-")) throw error; throw Object.assign(new Error("Preparation handle is missing or expired."), { code: "handle-missing" }); }
  if (fs.realpathSync(directory) !== directory || fs.realpathSync(file) !== file) throw Object.assign(new Error("Preparation handle does not resolve canonically."), { code: "handle-unsafe" });
  const bytes = fs.readFileSync(file);
  if (identity(bytes.toString("utf8")) !== match[2]) { fs.rmSync(directory, { recursive: true, force: true }); throw Object.assign(new Error("Preparation handle content was modified."), { code: "handle-tampered" }); }
  const value = JSON.parse(bytes.toString("utf8"));
  if (!value.createdAt || Date.now() - Date.parse(value.createdAt) > HANDLE_TTL_MS) { fs.rmSync(directory, { recursive: true, force: true }); throw Object.assign(new Error("Preparation handle expired."), { code: "handle-expired" }); }
  return { directory, value };
}

function draftingFacts(snapshot) {
  const range = `${snapshot.base.oid}..${snapshot.headOid}`;
  const maxBuffer = MAX_DRAFTING_COMMITS * (MAX_COMMIT_BODY_BYTES + MAX_COMMIT_SUBJECT_BYTES + 64);
  const raw = runGit(["log", "--format=%H%x00%s%x00%b%x00", `--max-count=${MAX_DRAFTING_COMMITS}`, range], { maxBuffer });
  const fields = raw.split("\0"); const records = [];
  for (let index = 0; index + 2 < fields.length; index += 3) {
    const subject = fields[index + 1]; const body = fields[index + 2];
    if (subject) records.push({ subject: Buffer.byteLength(subject) <= MAX_COMMIT_SUBJECT_BYTES ? subject : "", body: Buffer.byteLength(body) <= MAX_COMMIT_BODY_BYTES ? body : "" });
  }
  if (!records.length) for (const subject of runGit(["log", "--format=%s", `--max-count=${MAX_DRAFTING_COMMITS}`, range]).split(/\r?\n/).filter(Boolean)) records.push({ subject: Buffer.byteLength(subject) <= MAX_COMMIT_SUBJECT_BYTES ? subject : "", body: "" });
  const commitCount = Number.parseInt(runGit(["rev-list", "--count", range]), 10);
  const commits = records.map(({ subject }) => subject).filter(Boolean);
  const files = runGit(["diff", "--name-only", range]).split(/\r?\n/).filter(Boolean).slice(0, 100);
  return { commits, files, drafting: commitDraftingHints(records, { commitCount: Number.isSafeInteger(commitCount) ? commitCount : records.length }) };
}
function compactContext(snapshot) {
  const existing = snapshot.pr.exact;
  return {
    repository: compactRepo(snapshot.target), root: snapshot.root, branch: snapshot.branch,
    base: snapshot.base.ref,
    delivery: { target: compactRepo(snapshot.target), pushRemote: snapshot.push.remote, pushRepository: compactRepo(snapshot.push.repository), inferredMode: repoIdentity(snapshot.target) === repoIdentity(snapshot.push.repository) ? "same-repo" : "fork" },
    remoteState: snapshot.relation.divergence, upstream: snapshot.upstream,
    existingPr: existing ? { number: existing.number, url: existing.url, state: existing.state, title: existing.title, bodySha256: identity(existing.body), draft: existing.draft, labels: existing.labels } : null,
    changes: draftingFacts(snapshot), template: discoverPrTemplate(snapshot.root),
  };
}

function inspectFacts(base, pushRemote) {
  const response = inspect({ baseRef: base, pushRemote });
  if (response.status !== "inspect") throw Object.assign(new Error(response.error?.message || "Preparation inspection failed."), { code: response.error?.code || "inspection-failure" });
  safeSnapshot(response.snapshot.facts); return response.snapshot.facts;
}
function prepare(base, pushRemote, verbose) {
  tempRoot();
  const snapshot = inspectFacts(base, pushRemote); const createdAt = new Date().toISOString();
  const envelope = { schema: "flow-pr/context-v2", createdAt, base, pushRemote, snapshot };
  const handle = createStore("context.json", envelope);
  const intentPath = path.join(storeDirectory(handle.split(".")[0]), "intent.json"); fs.writeFileSync(intentPath, "{}\n", { mode: 0o600, flag: "wx" });
  const output = { schema: "flow-pr/prepare-context-v2", status: "prepared", exit: 0, phase: "prepare", handle, intentPath, expiresAt: expiresAt(createdAt), context: compactContext(snapshot) };
  if (verbose) output.diagnostics = { snapshot };
  return output;
}

function changedFields(pr, intent) {
  if (!pr) return [];
  const fields = [];
  if (pr.title !== intent.title) fields.push("title"); if (pr.body !== intent.body) fields.push("body"); if (pr.draft !== intent.draft) fields.push("draft");
  const labels = new Set(pr.labels); intent.labels.remove.forEach((label) => labels.delete(label)); intent.labels.add.forEach((label) => labels.add(label));
  if ([...labels].sort().join("\0") !== pr.labels.join("\0")) fields.push("labels");
  return fields;
}
function approvalSummary(request) {
  const snapshot = request.expected.snapshot; const changes = changedFields(snapshot.pr.exact, request.pr);
  const prAction = snapshot.pr.exact ? changes.length ? "update" : "noop" : "create";
  const upstreamExact = snapshot.upstream?.remote === request.delivery.push.remote && snapshot.upstream.ref === snapshot.branch;
  const gitAction = request.expected.intent.push === "verify-existing" ? "verify" : snapshot.relation.divergence === "equal" && upstreamExact ? "verify" : "push";
  return {
    repository: compactRepo(request.delivery.target), branchToBase: `${request.delivery.head.owner}:${request.delivery.head.ref} -> ${request.expected.snapshot.base.ref}`,
    action: { git: gitAction, pullRequest: prAction, expectation: `${gitAction} and ${prAction}` },
    title: request.pr.title,
    body: { bytes: Buffer.byteLength(request.pr.body), sha256: identity(request.pr.body) },
    draft: request.pr.draft, labels: request.pr.labels, authorizedUpdateFields: request.pr.updateExisting,
    delivery: { mode: request.delivery.mode, target: compactRepo(request.delivery.target), pushRemote: request.delivery.push.remote, pushRepository: compactRepo(request.delivery.push.repository) },
  };
}
function finalize(handle, verbose) {
  const stored = readStore(handle, "context.json"); const context = stored.value;
  try {
    const intentPath = path.join(stored.directory, "intent.json"); assertOwned(intentPath, "file");
    if (fs.realpathSync(intentPath) !== intentPath || fs.statSync(intentPath).size > 128 * 1024) throw Object.assign(new Error("Preparation intent file is unsafe or too large."), { code: "intent-unsafe" });
    const intent = validateIntent(JSON.parse(fs.readFileSync(intentPath, "utf8")));
    const snapshot = inspectFacts(context.base, context.pushRemote);
    if (snapshot.identity !== context.snapshot.identity) throw Object.assign(new Error("Repository authority changed during preparation; prepare again."), { code: "snapshot-drift" });
    const inferredMode = repoIdentity(snapshot.target) === repoIdentity(snapshot.push.repository) ? "same-repo" : "fork";
    if (intent.deliveryMode !== inferredMode) throw Object.assign(new Error(`Delivery mode must be '${inferredMode}' for the selected remotes.`), { code: "delivery-mismatch" });
    const request = validateRequest({
      schema: "flow-pr/request-v2",
      expected: { snapshot, intent: { push: intent.push, upstream: intent.push === "publish" ? "set" : "verify" } },
      delivery: { mode: intent.deliveryMode, target: snapshot.target, push: { remote: snapshot.push.remote, repository: snapshot.push.repository }, head: { owner: snapshot.head.owner, ref: snapshot.branch, repository: snapshot.head.repository } },
      pr: { title: intent.title, body: intent.body, draft: intent.draft, labels: intent.labels, updateExisting: intent.updateExisting },
    });
    const changes = changedFields(snapshot.pr.exact, intent); const missing = changes.filter((field) => !intent.updateExisting.includes(field));
    if (missing.length) throw Object.assign(new Error(`Intent does not authorize existing PR updates: ${missing.join(", ")}.`), { code: "update-not-authorized" });
    const createdAt = new Date().toISOString(); const envelope = { schema: "flow-pr/request-envelope-v2", createdAt, request };
    const bytes = Buffer.from(JSON.stringify(envelope)); const requestPath = path.join(stored.directory, "request.json");
    fs.writeFileSync(requestPath, bytes, { mode: 0o600, flag: "wx" }); fs.rmSync(path.join(stored.directory, "context.json")); fs.rmSync(intentPath);
    const requestHandle = `${handle.split(".")[0]}.${identity(bytes.toString("utf8"))}`;
    const output = { schema: "flow-pr/preparation-v2", status: "prepared", exit: 0, phase: "prepare", handle: requestHandle, expiresAt: expiresAt(createdAt), approval: approvalSummary(request) };
    if (verbose) output.diagnostics = { snapshot, request };
    return output;
  } catch (error) { fs.rmSync(stored.directory, { recursive: true, force: true }); throw error; }
}

function compactResult(value, verbose) {
  const facts = value.snapshot?.facts;
  const effects = Object.fromEntries(Object.entries(value.effects).map(([name, effect]) => [name, effect.state]));
  const pr = value.pr ? { number: value.pr.number, url: value.pr.url, state: value.pr.state, draft: value.pr.draft, title: value.pr.title, labels: value.pr.labels } : null;
  const prAction = effects.prCreate === "confirmed" ? "created" : effects.prUpdate === "confirmed" ? "updated" : value.status === "noop" ? "noop" : [effects.prCreate, effects.prUpdate].includes("unknown") ? "unknown" : "none";
  const output = { schema: value.schema, status: value.status, exit: value.exit, phase: value.phase, effects, pr, blocker: value.blocker, error: value.error, recovery: value.recovery,
    publication: facts ? { repository: compactRepo(facts.target), branch: facts.branch, headOid: facts.headOid, base: facts.base.ref, baseOid: facts.base.oid, action: { git: effects.push === "confirmed" ? "pushed" : "verified", pullRequest: prAction }, delivery: { target: compactRepo(facts.target), pushRemote: facts.push.remote, pushRepository: compactRepo(facts.push.repository) } } : null };
  if (verbose) output.diagnostics = { snapshot: value.snapshot };
  return output;
}
function claimExecution(handle) {
  const match = HANDLE_PATTERN.exec(handle);
  if (!match) throw Object.assign(new Error("Preparation handle is malformed."), { code: "handle-invalid" });
  const directory = storeDirectory(match[1]);
  try { assertOwned(directory, "directory"); }
  catch (error) { if (String(error.code || "").startsWith("handle-")) throw error; throw Object.assign(new Error("Preparation handle is missing or expired."), { code: "handle-missing" }); }
  if (fs.realpathSync(directory) !== directory) throw Object.assign(new Error("Preparation handle does not resolve canonically."), { code: "handle-unsafe" });
  const claim = path.join(directory, "execute.claim");
  let descriptor;
  try { descriptor = fs.openSync(claim, "wx", 0o600); fs.writeFileSync(descriptor, JSON.stringify({ pid: process.pid, claimedAt: new Date().toISOString() })); }
  catch (error) { if (error.code === "EEXIST") throw Object.assign(new Error("Preparation handle is already claimed. Prepare and approve a fresh request; abandoned claims are never retried."), { code: "handle-claimed" }); throw error; }
  finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
function executeHandle(handle, verbose) {
  claimExecution(handle);
  const stored = readStore(handle, "request.json");
  try { return compactResult(execute(validateRequest(stored.value.request)), verbose); }
  finally { fs.rmSync(stored.directory, { recursive: true, force: true }); }
}

try {
  const options = parse(process.argv.slice(2));
  if (options.mode === "prepare") write(prepare(options.base, options.pushRemote, options.verbose));
  else if (options.mode === "finalize") write(finalize(options.handle, options.verbose));
  else write(executeHandle(options.handle, options.verbose));
} catch (error) {
  if (error.code === "handle-claimed") write(compactResult({ schema: "flow-pr/result-v1", status: "blocked", exit: 2, phase: "preflight", snapshot: { expected: null, observed: null, facts: null }, effects: blankEffects(), pr: null, blocker: { code: error.code, message: error.message }, error: null, recovery: { code: "prepare-again", message: "Prepare and approve a fresh request.", requiresFreshInspection: true } }, false));
  else { const output = compactResult(failureResult(error), false); output.error.code = error.code || output.error.code; write(output); }
}
