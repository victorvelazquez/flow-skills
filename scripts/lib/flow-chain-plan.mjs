import crypto from "node:crypto";
import { digestChangedPaths } from "./flow-check-evidence.mjs";

export const FLOW_CHAIN_PLAN_SCHEMA = "flow-chain-plan/v2";
export const LEGACY_FLOW_CHAIN_PLAN_SCHEMA = "flow-chain-plan/v1";
export const FLOW_CHAIN_STRATEGIES = Object.freeze(["stacked-to-main", "feature-branch-chain"]);

export function assertChainPlanVersion(plan) {
  if (plan?.version === LEGACY_FLOW_CHAIN_PLAN_SCHEMA) throw new Error(`Legacy chain plan '${LEGACY_FLOW_CHAIN_PLAN_SCHEMA}' cannot be published; regenerate the plan as '${FLOW_CHAIN_PLAN_SCHEMA}'.`);
  if (plan?.version !== FLOW_CHAIN_PLAN_SCHEMA) throw new Error(`Invalid chain plan version: expected '${FLOW_CHAIN_PLAN_SCHEMA}'.`);
}

export function canonicalizeChainBranchName(name) {
  return typeof name === "string" && name.startsWith("origin/")
    ? name.slice("origin/".length)
    : name;
}

export function normalizeChainPlanRefs(plan, options = {}) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) return plan;
  const normalizeRef = (ref, field) => {
    if (!ref || typeof ref !== "object" || Array.isArray(ref)) return ref;
    const name = ref.name;
    if (typeof name === "string" && name.startsWith("origin/")) {
      if (options.isLiteralBranch?.(name)) {
        throw new Error(`Chain plan '${field}.name' is ambiguous: '${name}' exists as a literal local branch.`);
      }
      return { ...ref, name: canonicalizeChainBranchName(name) };
    }
    return { ...ref };
  };
  return {
    ...plan,
    integrationRef: normalizeRef(plan.integrationRef, "integrationRef"),
    productionRef: normalizeRef(plan.productionRef, "productionRef"),
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
export function getChainPlanIdentity(plan) { return crypto.createHash("sha256").update(JSON.stringify(canonicalize(plan))).digest("hex"); }

function globMatch(filePath, pattern) {
  const escaped = pattern.replace(/\\/g, "/").replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i").test(filePath.replace(/\\/g, "/"));
}
export function isGeneratedPath(filePath, patterns) { return patterns.some((pattern) => globMatch(filePath, pattern)); }
export function parseNumstat(output, patterns) {
  return String(output || "").split(/\r?\n/).filter(Boolean).map((line) => {
    const [addedRaw, deletedRaw, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t").replace(/\\/g, "/");
    if (!filePath) throw new Error(`Invalid git numstat line: ${line}`);
    const added = addedRaw === "-" ? 0 : Number.parseInt(addedRaw, 10), deleted = deletedRaw === "-" ? 0 : Number.parseInt(deletedRaw, 10);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) throw new Error(`Invalid git numstat counts for '${filePath}'.`);
    const generated = isGeneratedPath(filePath, patterns);
    return { path: filePath, added, deleted, authoredLines: generated ? 0 : added + deleted, generatedLines: generated ? added + deleted : 0, generated };
  });
}
export function summarizeLineAccounting(files) { return { authoredLines: files.reduce((sum, file) => sum + file.authoredLines, 0), generatedLines: files.reduce((sum, file) => sum + file.generatedLines, 0), totalLines: files.reduce((sum, file) => sum + file.authoredLines + file.generatedLines, 0), files }; }
function forecastScope(filePath) { const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean); const root = parts.findIndex((part) => ["src", "app", "lib", "packages"].includes(part)); return parts[root + 1] || parts[0] || "root"; }
export function proposeChainBoundaries(files, reviewBudget) {
  const ordered = [...files].sort((a, b) => forecastScope(a.path).localeCompare(forecastScope(b.path)) || a.path.localeCompare(b.path));
  const slices = [];
  let current = null;
  for (const file of ordered) {
    const scope = forecastScope(file.path);
    if (!current || current.authoredLines + file.authoredLines > reviewBudget || (current.scope !== scope && current.authoredLines > 0)) {
      current = { id: `wu-${String(slices.length + 1).padStart(2, "0")}`, scope, summary: `Deliver ${scope} work unit`, changedPaths: [], authoredLines: 0, generatedLines: 0 };
      slices.push(current);
    }
    current.changedPaths.push(file.path); current.authoredLines += file.authoredLines; current.generatedLines += file.generatedLines;
  }
  return slices.map((slice) => ({ ...slice, changedPathsDigest: digestChangedPaths(slice.changedPaths), overBudget: slice.authoredLines > reviewBudget }));
}

function requireString(value, field) { if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid chain plan: '${field}' must be a non-empty string.`); }
function requireStringArray(value, field, allowEmpty = true) { if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) throw new Error(`Invalid chain plan: '${field}' must be a string array.`); }
function validateRefShape(ref, field) { for (const key of ["name", "expectedSha", "expectedTree"]) requireString(ref?.[key], `${field}.${key}`); }
function validatePublicationShape(entry, field) {
  for (const key of ["id", "head", "base", "expectedHeadSha", "expectedTree", "changedPathsDigest", "rollbackBoundary", "outOfScope"]) requireString(entry?.[key], `${field}.${key}`);
  requireStringArray(entry.changedPaths, `${field}.changedPaths`, false); requireStringArray(entry.dependencyIds, `${field}.dependencyIds`); requireStringArray(entry.validationEvidenceRefs, `${field}.validationEvidenceRefs`);
  for (const key of ["authoredLines", "generatedLines"]) if (!Number.isInteger(entry[key]) || entry[key] < 0) throw new Error(`Invalid chain plan: '${field}.${key}' must be a non-negative integer.`);
  if (new Set(entry.changedPaths).size !== entry.changedPaths.length) throw new Error(`Invalid chain plan: '${field}.changedPaths' contains duplicates.`);
  if (entry.changedPathsDigest !== digestChangedPaths(entry.changedPaths)) throw new Error(`Invalid chain plan: '${field}.changedPathsDigest' is inconsistent.`);
}
function validateWorkUnitShape(entry, field) {
  for (const key of ["workUnitId", "title", "startState", "endState", "priorWork", "followUp"]) requireString(entry?.[key], `${field}.${key}`);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(entry.workUnitId)) throw new Error(`Invalid chain plan: '${field}.workUnitId' must be stable and identifier-safe.`);
  for (const key of ["command", "result"]) requireString(entry.focusedTest?.[key], `${field}.focusedTest.${key}`);
  const runtime = entry.runtimeVerification;
  if (runtime?.naReason) {
    requireString(runtime.naReason, `${field}.runtimeVerification.naReason`);
    if (runtime.scenario != null || runtime.result != null) throw new Error(`Invalid chain plan: '${field}.runtimeVerification' must declare a scenario/result or an N/A reason, not both.`);
  } else {
    for (const key of ["scenario", "result"]) requireString(runtime?.[key], `${field}.runtimeVerification.${key}`);
  }
  for (const key of ["implementation", "tests", "docs"]) requireStringArray(entry.paths?.[key], `${field}.paths.${key}`);
  if (!Array.isArray(entry.paths?.sharedSupport)) throw new Error(`Invalid chain plan: '${field}.paths.sharedSupport' must be an array.`);
  entry.paths.sharedSupport.forEach((support, index) => {
    for (const key of ["path", "ownerWorkUnitId", "rationale"]) requireString(support?.[key], `${field}.paths.sharedSupport[${index}].${key}`);
    if (support.ownerWorkUnitId !== entry.workUnitId) throw new Error(`Invalid chain plan: '${field}.paths.sharedSupport[${index}]' must be owned by '${entry.workUnitId}'.`);
  });
  const declared = [...entry.paths.implementation, ...entry.paths.tests, ...entry.paths.docs, ...entry.paths.sharedSupport.map((item) => item.path)];
  if (new Set(declared).size !== declared.length || JSON.stringify([...declared].sort()) !== JSON.stringify([...entry.changedPaths].sort())) throw new Error(`Invalid chain plan: '${field}.paths' must declare every changed path exactly once.`);
  if ((entry.paths.tests.length || entry.paths.docs.length) && entry.paths.implementation.length === 0) throw new Error(`Invalid chain plan: '${field}' cannot be a tests/docs-only work unit separated from implementation behavior.`);
  const looksLikeTest = (item) => /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)/i.test(item) || /\.(?:test|spec)\.[^/]+$/i.test(item);
  const looksLikeDocs = (item) => /(?:^|\/)docs(?:\/|$)/i.test(item) || /\.md$/i.test(item);
  if (entry.changedPaths.some((item) => looksLikeTest(item) && !entry.paths.tests.includes(item)) || entry.changedPaths.some((item) => looksLikeDocs(item) && !entry.paths.docs.includes(item))) throw new Error(`Invalid chain plan: '${field}.paths' misclassifies test or documentation paths.`);
  if (entry.sizeException != null) for (const key of ["label", "maintainer", "rationale"]) requireString(entry.sizeException?.[key], `${field}.sizeException.${key}`);
  if (entry.sizeException && entry.sizeException.label !== "size:exception") throw new Error(`Invalid chain plan: '${field}.sizeException.label' must be 'size:exception'.`);
}
function assertNoDependencyCycles(entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry])), visiting = new Set(), visited = new Set();
  const visit = (id) => { if (visiting.has(id)) throw new Error(`Invalid chain plan: dependency cycle at '${id}'.`); if (visited.has(id)) return; const entry = byId.get(id); if (!entry) throw new Error(`Invalid chain plan: unknown dependency '${id}'.`); visiting.add(id); for (const dependency of entry.dependencyIds) visit(dependency); visiting.delete(id); visited.add(id); };
  for (const entry of entries) visit(entry.id);
}
function requireRefMatch(name, sha, tree, context) { const actual = context.refs[name]; if (!actual) throw new Error(`Chain plan ref '${name}' does not exist.`); if (actual.sha !== sha || actual.tree !== tree) throw new Error(`Chain plan ref '${name}' is stale.`); }
function validatePublication(entry, context, { enforceBudget = true } = {}) {
  const branch = context.classifyBranch(entry.head), rawPrefix = entry.head.split("/")[0];
  if (!branch.valid || branch.kind !== "task" || rawPrefix !== branch.prefix) throw new Error(`Invalid chain plan head '${entry.head}': only canonical task branches are allowed.`);
  if (context.protectedBranches.includes(entry.head)) throw new Error(`Invalid chain plan head '${entry.head}': protected heads cannot be pushed.`);
  requireRefMatch(entry.head, entry.expectedHeadSha, entry.expectedTree, context);
  const base = context.refs[entry.base];
  if (!base) throw new Error(`Chain plan base '${entry.base}' does not exist.`);
  if (!context.isAncestor(base.sha, entry.expectedHeadSha)) throw new Error(`Chain plan ancestry failed: '${entry.base}' is not an ancestor of '${entry.head}'.`);
  const diff = context.diffs[`${entry.base}..${entry.head}`];
  if (!diff) throw new Error(`Chain plan diff '${entry.base}..${entry.head}' was not collected.`);
  if (JSON.stringify([...entry.changedPaths].sort()) !== JSON.stringify([...diff.changedPaths].sort()) || diff.changedPathsDigest !== entry.changedPathsDigest) throw new Error(`Chain plan work unit '${entry.id}' has a polluted immediate-base diff.`);
  if (diff.authoredLines !== entry.authoredLines || diff.generatedLines !== entry.generatedLines) throw new Error(`Chain plan line accounting changed for '${entry.id}'.`);
  if (enforceBudget && entry.authoredLines > context.reviewBudget && entry.sizeException?.label !== "size:exception") throw new Error(`Chain plan work unit '${entry.id}' exceeds the ${context.reviewBudget}-line authored review budget without an immutable maintainer size:exception and rationale.`);
  return entry.validationEvidenceRefs.map((ref) => { const result = context.validateEvidence(ref, entry, base.sha); if (result.status !== "Passed") throw new Error(`Chain plan evidence '${ref}' for '${entry.id}' is ${result.status}.`); return { ref, status: result.status, details: result.details || [] }; });
}

export function buildChainContext(plan, entry, index, reviewBudget) {
  return {
    dependencyDiagram: plan.prs.map((item, itemIndex) => `${itemIndex === index ? "[current]" : "[ ]"} ${item.workUnitId}: ${item.title}`).join("\n"),
    currentMarker: entry.workUnitId,
    prior: entry.priorWork,
    followUp: entry.followUp,
    start: entry.startState,
    end: entry.endState,
    outOfScope: entry.outOfScope,
    verification: { focusedTest: entry.focusedTest, runtime: entry.runtimeVerification },
    rollback: entry.rollbackBoundary,
    budget: { authoredLines: entry.authoredLines, limit: reviewBudget, exception: entry.sizeException || null },
  };
}

export function validateChainPlan(plan, context, options = {}) {
  const mode = options.mode || "publication";
  if (!new Set(["publication", "finalization"]).has(mode)) throw new Error(`Invalid chain plan validation mode '${mode}'.`);
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Invalid chain plan: root must be an object.");
  assertChainPlanVersion(plan);
  plan = normalizeChainPlanRefs(plan, {
    isLiteralBranch: (name) => Boolean(context.refs?.[name]),
  });
  if (!FLOW_CHAIN_STRATEGIES.includes(plan.strategy)) throw new Error(`Invalid chain plan strategy '${plan.strategy}'.`);
  requireString(plan.repository?.identity, "repository.identity");
  if (plan.repository.identity.toLowerCase() !== context.repositoryIdentity.toLowerCase()) throw new Error("Chain plan repository identity does not match the current repository.");
  validateRefShape(plan.integrationRef, "integrationRef"); validateRefShape(plan.productionRef, "productionRef");
  if (plan.integrationRef.name !== context.integrationRef) throw new Error("Chain plan integration ref is not the configured integration branch.");
  if (plan.productionRef.name !== context.productionRef) throw new Error("Chain plan production ref is not the configured production branch.");
  if (mode === "publication") { requireRefMatch(plan.integrationRef.name, plan.integrationRef.expectedSha, plan.integrationRef.expectedTree, context); requireRefMatch(plan.productionRef.name, plan.productionRef.expectedSha, plan.productionRef.expectedTree, context); }
  if (!Array.isArray(plan.prs) || plan.prs.length === 0) throw new Error("Invalid chain plan: 'prs' must contain ordered entries.");
  const publications = [];
  if (plan.strategy === "feature-branch-chain") {
    if (!plan.tracker || typeof plan.tracker !== "object" || Array.isArray(plan.tracker)) throw new Error("Feature branch chain requires exactly one tracker object.");
    validatePublicationShape(plan.tracker, "tracker");
    if (plan.tracker.workUnitId != null) throw new Error("Feature branch tracker is a control-plane object and cannot declare workUnitId.");
    if (plan.tracker.draft !== true || plan.tracker.noMerge !== true) throw new Error("Feature branch tracker must be draft and no-merge.");
    publications.push({ ...plan.tracker, tracker: true });
  }
  else if (plan.tracker != null) throw new Error("Stacked-to-main plans cannot include tracker metadata.");
  plan.prs.forEach((entry, index) => { validatePublicationShape(entry, `prs[${index}]`); validateWorkUnitShape(entry, `prs[${index}]`); }); publications.push(...plan.prs.map((entry) => ({ ...entry, tracker: false })));
  if (plan.strategy === "feature-branch-chain") {
    requireString(plan.expectedFinalTree, "expectedFinalTree");
    if (plan.expectedFinalTree !== plan.prs.at(-1).expectedTree) throw new Error("Feature branch expectedFinalTree must equal the deepest semantic child expectedTree.");
  } else if (plan.expectedFinalTree != null) throw new Error("Stacked-to-main plans cannot declare expectedFinalTree.");
  for (const [name, values] of [["id", publications.map((entry) => entry.id)], ["head", publications.map((entry) => entry.head)], ["head/base", publications.map((entry) => `${entry.head}->${entry.base}`)]]) if (new Set(values).size !== values.length) throw new Error(`Invalid chain plan: duplicate ${name}.`);
  assertNoDependencyCycles(publications);
  if (new Set(plan.prs.map((entry) => entry.workUnitId)).size !== plan.prs.length) throw new Error("Invalid chain plan: each child PR must have one unique semantic workUnitId.");
  const firstBase = plan.strategy === "feature-branch-chain" ? plan.tracker.head : plan.integrationRef.name;
  if (plan.strategy === "feature-branch-chain" && (plan.tracker.base !== plan.integrationRef.name || plan.tracker.dependencyIds.length !== 0)) throw new Error("Feature branch tracker must target integration with no dependencies.");
  plan.prs.forEach((entry, index) => { const expectedBase = index === 0 ? firstBase : plan.prs[index - 1].head; const expectedDependency = index === 0 ? (plan.strategy === "feature-branch-chain" ? [plan.tracker.id] : []) : [plan.prs[index - 1].id]; if (entry.base !== expectedBase || JSON.stringify(entry.dependencyIds) !== JSON.stringify(expectedDependency)) throw new Error(`Chain plan entry '${entry.id}' must use immediate base '${expectedBase}' and dependencies '${expectedDependency.join(",")}'.`); });
  const evidence = {};
  for (const publication of publications) {
    if (mode === "publication") evidence[publication.id] = validatePublication(publication, context, { enforceBudget: !publication.tracker });
    else evidence[publication.id] = publication.validationEvidenceRefs.map((ref) => {
      const result = context.validateEvidence(ref, publication, context.refs[publication.base]?.sha);
      if (result.status !== "Passed") throw new Error(`Chain plan evidence '${ref}' for '${publication.id}' is ${result.status}.`);
      return { ref, status: result.status, details: result.details || [] };
    });
  }
  const chainContexts = Object.fromEntries(plan.prs.map((entry, index) => [entry.id, buildChainContext(plan, entry, index, context.reviewBudget)]));
  return { valid: true, strategy: plan.strategy, planIdentity: getChainPlanIdentity(plan), publications, workUnits: plan.prs, evidence, chainContexts };
}

export function buildChainForecast(lineAccounting, config) {
  const oversized = lineAccounting.authoredLines > config.chain.reviewBudget;
  return { oversized, reviewBudget: config.chain.reviewBudget, authoredLines: lineAccounting.authoredLines, generatedLines: lineAccounting.generatedLines, totalLines: lineAccounting.totalLines, decisionRequired: oversized, supportedStrategies: [...FLOW_CHAIN_STRATEGIES], validatedChainPlan: false, advisory: "Path-based forecast only; this is not a validated chain plan or semantic work-unit split.", proposedWorkUnits: oversized ? proposeChainBoundaries(lineAccounting.files, config.chain.reviewBudget) : [] };
}
