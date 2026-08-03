import { createHash } from "node:crypto";

const CONTROL = /[\u0000-\u001f\u007f]/;
const BODY_CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const REF = /^(?!-|.*\.\.|.*\/$|.*@\{|.*\\)(?!.*(?:^|\/)\.)(?!.*(?:^|\/)\.\.)([A-Za-z0-9][A-Za-z0-9._/-]*)$/;
const OID = /^[0-9a-f]{40}$/;

export class ContractError extends Error {
  constructor(message, code = "invalid-contract") { super(message); this.code = code; }
}

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function identity(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
export function blankEffect() { return { state: "not-attempted", before: null, after: null }; }
export function blankEffects() { return { push: blankEffect(), upstream: blankEffect(), prCreate: blankEffect(), prUpdate: blankEffect(), labels: blankEffect() }; }
export function hasControl(value) { return typeof value !== "string" || value.length === 0 || CONTROL.test(value); }

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ContractError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ContractError(`${label} has unsupported or missing properties.`);
  return value;
}
function text(value, label) { if (hasControl(value)) throw new ContractError(`${label} must be non-empty single-line text.`); return value; }
function multiline(value, label) { if (typeof value !== "string" || BODY_CONTROL.test(value)) throw new ContractError(`${label} contains control characters.`); return value; }
function list(value, label) { if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || hasControl(item)) || new Set(value).size !== value.length) throw new ContractError(`${label} must be a unique text array.`); return value; }

export function validateRepo(value, label = "repository") {
  exact(value, ["host", "owner", "name"], label);
  if (value.host !== "github.com" || !NAME.test(value.owner) || !NAME.test(value.name)) throw new ContractError(`${label} is not a canonical github.com repository.`);
  return { host: "github.com", owner: value.owner, name: value.name };
}
export function repoIdentity(repo) { return `${repo.host}/${repo.owner}/${repo.name}`.toLowerCase(); }
export function validateRef(value, label = "ref") { if (typeof value !== "string" || hasControl(value) || !REF.test(value)) throw new ContractError(`${label} is not a safe Git ref.`); return value; }
export function validateOid(value, label = "OID") { if (typeof value !== "string" || !OID.test(value)) throw new ContractError(`${label} is not a full commit OID.`); return value; }

export function validatePr(value, label = "PR") {
  exact(value, ["base", "body", "draft", "head", "labels", "number", "repository", "state", "title", "url"], label);
  if (!Number.isSafeInteger(value.number) || value.number < 1 || !["open", "closed", "merged"].includes(value.state) || typeof value.draft !== "boolean") throw new ContractError(`${label} has invalid state.`);
  validateRepo(value.repository, `${label}.repository`); exact(value.head, ["oid", "owner", "ref"], `${label}.head`); text(value.head.owner, `${label}.head.owner`); validateRef(value.head.ref, `${label}.head.ref`); validateOid(value.head.oid, `${label}.head.oid`);
  exact(value.base, ["oid", "ref"], `${label}.base`); validateRef(value.base.ref, `${label}.base.ref`); validateOid(value.base.oid, `${label}.base.oid`); text(value.title, `${label}.title`); multiline(value.body, `${label}.body`); list(value.labels, `${label}.labels`);
  let url; try { url = new URL(value.url); } catch { throw new ContractError(`${label}.url is invalid.`); }
  const parts = url.pathname.split("/");
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.username || url.password || url.port || url.search || url.hash || parts.length !== 5 || parts[0] !== "" || parts[3] !== "pull" || parts[4] !== String(value.number) || parts[1].toLowerCase() !== value.repository.owner.toLowerCase() || parts[2].toLowerCase() !== value.repository.name.toLowerCase() || CONTROL.test(value.url)) throw new ContractError(`${label}.url is inconsistent with its repository or number.`);
  return { ...value, labels: [...value.labels].sort() };
}

function validatePrFacts(value) {
  exact(value, ["availability", "candidates", "exact", "reason"], "snapshot.pr");
  if (!["none", "exact", "ambiguous", "unavailable"].includes(value.availability) || !Array.isArray(value.candidates)) throw new ContractError("snapshot.pr is invalid.");
  const candidates = value.candidates.map((entry) => validatePr(entry));
  const exactPr = value.exact === null ? null : validatePr(value.exact);
  const reasonValid = value.reason === null || typeof value.reason === "string" && value.reason.length > 0 && !CONTROL.test(value.reason);
  if (!reasonValid) throw new ContractError("snapshot.pr reason is invalid.");
  const consistent = value.availability === "none" ? exactPr === null && candidates.length === 0 && value.reason === null
    : value.availability === "exact" ? exactPr !== null && candidates.length === 1 && canonical(exactPr) === canonical(candidates[0]) && value.reason === null
      : value.availability === "ambiguous" ? exactPr === null && candidates.length > 1 && value.reason !== null
        : exactPr === null && candidates.length === 0 && value.reason !== null;
  if (!consistent) throw new ContractError("snapshot.pr availability and exact facts are inconsistent.");
  return { availability: value.availability, exact: exactPr, candidates: candidates.sort((a, b) => a.number - b.number), reason: value.reason };
}

export function snapshotWithIdentity(snapshot) {
  const copy = structuredClone(snapshot); delete copy.identity;
  const normalized = { ...copy, remotes: [...copy.remotes].sort((a, b) => a.name.localeCompare(b.name)) };
  normalized.pr = validatePrFacts(normalized.pr);
  return { ...normalized, identity: identity(normalized) };
}

export function validateSnapshot(value) {
  exact(value, ["base", "branch", "clean", "committed", "commonDir", "detached", "head", "headOid", "identity", "mergeState", "pr", "push", "relation", "remotes", "root", "target", "upstream"], "snapshot");
  if (typeof value.root !== "string" || typeof value.commonDir !== "string" || hasControl(value.root) || hasControl(value.commonDir)) throw new ContractError("snapshot paths are invalid.");
  if (value.branch !== null) validateRef(value.branch, "snapshot.branch"); if (value.headOid !== null) validateOid(value.headOid, "snapshot.headOid");
  if (typeof value.clean !== "boolean" || typeof value.detached !== "boolean" || typeof value.committed !== "boolean" || !["none", "merge", "rebase", "cherry-pick", "revert", "bisect", "unknown"].includes(value.mergeState)) throw new ContractError("snapshot state is invalid.");
  validateRepo(value.target, "snapshot.target"); exact(value.push, ["remote", "remoteHeadOid", "repository"], "snapshot.push"); text(value.push.remote, "snapshot.push.remote"); validateRepo(value.push.repository, "snapshot.push.repository"); if (value.push.remoteHeadOid !== null) validateOid(value.push.remoteHeadOid, "snapshot.push.remoteHeadOid");
  exact(value.head, ["oid", "owner", "ref", "repository"], "snapshot.head"); validateRepo(value.head.repository, "snapshot.head.repository"); text(value.head.owner, "snapshot.head.owner"); if (value.head.ref !== null) validateRef(value.head.ref, "snapshot.head.ref"); if (value.head.oid !== null) validateOid(value.head.oid, "snapshot.head.oid");
  if (value.committed !== (value.headOid !== null) || value.head.oid !== value.headOid || value.detached !== (value.branch === null && value.committed) || value.head.ref !== value.branch) throw new ContractError("snapshot head state is inconsistent.");
  exact(value.base, ["evidence", "oid", "ref", "repository", "source"], "snapshot.base"); validateRepo(value.base.repository, "snapshot.base.repository"); validateRef(value.base.ref, "snapshot.base.ref"); validateOid(value.base.oid, "snapshot.base.oid");
  if (!["explicit", "branch-config", "existing-pr", "github-default", "origin-head"].includes(value.base.source) || hasControl(value.base.evidence)) throw new ContractError("snapshot.base authority is invalid.");
  if (value.upstream !== null) { exact(value.upstream, ["ref", "remote"], "snapshot.upstream"); text(value.upstream.remote, "snapshot.upstream.remote"); validateRef(value.upstream.ref, "snapshot.upstream.ref"); }
  if (!Array.isArray(value.remotes)) throw new ContractError("snapshot.remotes must be an array."); for (const remote of value.remotes) { exact(remote, ["fetch", "name", "push"], "remote"); text(remote.name, "remote.name"); validateRepo(remote.fetch, "remote.fetch"); validateRepo(remote.push, "remote.push"); }
  exact(value.relation, ["ahead", "behind", "divergence"], "snapshot.relation");
  const count = (entry) => entry === null || Number.isSafeInteger(entry) && entry >= 0;
  if (!count(value.relation.ahead) || !count(value.relation.behind) || !["equal", "ahead", "behind", "diverged", "unborn", "unknown"].includes(value.relation.divergence)) throw new ContractError("snapshot.relation is invalid.");
  validatePrFacts(value.pr);
  if (!/^[0-9a-f]{64}$/.test(value.identity) || snapshotWithIdentity(value).identity !== value.identity) throw new ContractError("snapshot identity is invalid.");
  return value;
}

export function validateRequest(value) {
  exact(value, ["delivery", "expected", "pr", "schema"], "request");
  if (value.schema !== "flow-pr/request-v2") throw new ContractError("request must be a runtime-owned flow-pr/request-v2.");
  exact(value.expected, ["intent", "snapshot"], "request.expected"); validateSnapshot(value.expected.snapshot); exact(value.expected.intent, ["push", "upstream"], "request.expected.intent"); if (!["publish", "verify-existing"].includes(value.expected.intent.push) || !["set", "verify"].includes(value.expected.intent.upstream)) throw new ContractError("request intent is invalid.");
  exact(value.delivery, ["head", "mode", "push", "target"], "request.delivery"); if (!["same-repo", "fork"].includes(value.delivery.mode)) throw new ContractError("request delivery mode is invalid."); validateRepo(value.delivery.target, "request.delivery.target"); exact(value.delivery.push, ["remote", "repository"], "request.delivery.push"); text(value.delivery.push.remote, "request.delivery.push.remote"); validateRepo(value.delivery.push.repository, "request.delivery.push.repository"); exact(value.delivery.head, ["owner", "ref", "repository"], "request.delivery.head"); text(value.delivery.head.owner, "request.delivery.head.owner"); validateRef(value.delivery.head.ref, "request.delivery.head.ref"); validateRepo(value.delivery.head.repository, "request.delivery.head.repository");
  exact(value.pr, ["body", "draft", "labels", "title", "updateExisting"], "request.pr"); text(value.pr.title, "request.pr.title"); multiline(value.pr.body, "request.pr.body"); if (typeof value.pr.draft !== "boolean") throw new ContractError("request.pr.draft is invalid."); exact(value.pr.labels, ["add", "remove"], "request.pr.labels"); list(value.pr.labels.add, "request.pr.labels.add"); list(value.pr.labels.remove, "request.pr.labels.remove"); if (value.pr.labels.add.some((label) => value.pr.labels.remove.includes(label))) throw new ContractError("request labels add/remove overlap."); if (!Array.isArray(value.pr.updateExisting) || value.pr.updateExisting.some((field) => !["title", "body", "draft", "labels"].includes(field)) || new Set(value.pr.updateExisting).size !== value.pr.updateExisting.length) throw new ContractError("request.pr.updateExisting is invalid.");
  return value;
}

export function validateIntent(value) {
  exact(value, ["body", "deliveryMode", "draft", "labels", "push", "schema", "title", "updateExisting"], "intent");
  if (value.schema !== "flow-pr/intent-v2") throw new ContractError("intent must be flow-pr/intent-v2.");
  text(value.title, "intent.title"); multiline(value.body, "intent.body");
  if (typeof value.draft !== "boolean") throw new ContractError("intent.draft is invalid.");
  if (!["same-repo", "fork"].includes(value.deliveryMode)) throw new ContractError("intent.deliveryMode is invalid.");
  if (!["publish", "verify-existing"].includes(value.push)) throw new ContractError("intent.push is invalid.");
  exact(value.labels, ["add", "remove"], "intent.labels"); list(value.labels.add, "intent.labels.add"); list(value.labels.remove, "intent.labels.remove");
  if (value.labels.add.some((label) => value.labels.remove.includes(label))) throw new ContractError("intent labels add/remove overlap.");
  if (!Array.isArray(value.updateExisting) || value.updateExisting.some((field) => !["title", "body", "draft", "labels"].includes(field)) || new Set(value.updateExisting).size !== value.updateExisting.length) throw new ContractError("intent.updateExisting is invalid.");
  return value;
}
