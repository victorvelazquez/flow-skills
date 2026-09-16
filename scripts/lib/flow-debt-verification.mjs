import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const FLOW_DEBT_VERIFICATION_CATEGORIES = Object.freeze([
  "concurrency",
  "stale-handles",
  "residues",
  "recovery",
  "rollback",
  "postcondition",
  "packaged-state",
  "deployed-state",
  "portable-core-authority",
]);

function evidence(value) {
  if (typeof value === "string" && value) return [value];
  if (Array.isArray(value))
    return value.filter((item) => typeof item === "string" && item);
  return [];
}

function classification(category, status, reason, recorded = []) {
  return { category, status, evidence: recorded, reason };
}

function skipped(category, reason, recorded) {
  return classification(category, "skip", reason, recorded);
}

function failed(category, reason, recorded) {
  return classification(category, "fail", reason, recorded);
}

function snapshotEntry(root, relative = "") {
  const target = path.join(root, relative);
  const stat = fs.lstatSync(target);
  if (stat.isDirectory())
    return [
      { path: relative, type: "directory" },
      ...fs
        .readdirSync(target)
        .sort()
        .flatMap((name) => snapshotEntry(root, path.join(relative, name))),
    ];
  if (!stat.isFile())
    return [
      { path: relative, type: stat.isSymbolicLink() ? "symlink" : "other" },
    ];
  return [
    {
      path: relative,
      type: "file",
      bytes: stat.size,
      sha256: createHash("sha256")
        .update(fs.readFileSync(target))
        .digest("hex"),
    },
  ];
}

/**
 * Capture a read-only tree identity for a verifier fixture or repository root.
 * Symlinks are recorded, never followed.
 */
export function snapshotFlowDebtState(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || !repositoryRoot)
    throw new Error("Flow debt verification requires a repository root.");
  const root = path.resolve(repositoryRoot);
  if (!fs.lstatSync(root).isDirectory() || fs.lstatSync(root).isSymbolicLink())
    throw new Error("Flow debt verification repository root is unavailable.");
  return snapshotEntry(root);
}

function classify(category, check) {
  if (!check)
    return skipped(
      category,
      category === "deployed-state"
        ? "deployed capability was not supplied"
        : `${category} capability was not supplied`,
    );
  if (check.available === false)
    return skipped(
      category,
      check.reason || `${category} capability is unavailable`,
    );

  const recorded = evidence(check.evidence);
  const status =
    check.passed === false
      ? "fail"
      : check.passed === true && recorded.length
        ? "pass"
        : "skip";
  const reason =
    check.reason ||
    (status === "pass"
      ? "recorded evidence passed"
      : status === "fail"
        ? "recorded evidence failed"
        : "no recorded result");
  return classification(category, status, reason, recorded);
}

function claimedGrant(source) {
  const grants = source.text.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\{[^}]*\bgranted\s*:\s*true\b[^}]*\}/g,
  );
  for (const match of grants)
    if (new RegExp(`\\b${match[1]}\\.granted\\b`).test(source.text))
      return `${source.path || "portable-core"}: ${match[0]}`;
}

function classifyPortableCore(portableCore = {}) {
  const category = "portable-core-authority";
  if (portableCore.available === false)
    return skipped(
      category,
      portableCore.reason || "portable core source is unavailable",
    );

  const sources = Array.isArray(portableCore.sources)
    ? portableCore.sources
    : [];
  if (!sources.length)
    return skipped(category, "portable core source was not supplied");
  if (
    sources.some(
      (source) => typeof source?.text !== "string" || !source.text.trim(),
    )
  )
    return skipped(category, "portable core source text was not supplied");
  const claimed = sources.map(claimedGrant).find(Boolean);
  if (claimed)
    return failed(category, "portable core contains a claimed approval grant", [
      claimed,
    ]);

  const contract = portableCore.authorityEvidence;
  if (!contract || contract.complete !== true)
    return skipped(
      category,
      "complete independent authority evidence was not supplied",
    );

  const required = [
    ["hostOwnership", "host ownership"],
    ["noPortableSelfAuthorization", "portable self-authorization"],
  ].map(([key, label]) => ({ label, record: contract[key] }));
  for (const { label, record } of required) {
    if (record?.status === "fail")
      return failed(
        category,
        record.reason || `${label} evidence failed`,
        evidence(record.evidence),
      );
    if (
      !(
        record?.status === "pass" &&
        record.independent === true &&
        evidence(record.evidence).length
      )
    )
      return skipped(
        category,
        `independent ${label} evidence was not supplied`,
        evidence(record?.evidence),
      );
  }
  return classification(
    category,
    "pass",
    "complete independent authority evidence passed",
    [
      ...required.flatMap(({ record }) => evidence(record.evidence)),
      ...sources.map(
        ({ path: sourcePath }) =>
          `source supplied: ${sourcePath || "portable-core"}`,
      ),
    ],
  );
}

/**
 * Classify supplied static or recorded evidence without invoking mutations.
 * The before/after snapshots make any verifier-side state change observable.
 */
export function verifyFlowDebtMutationSafety({
  repositoryRoot,
  checks = {},
  portableCore,
} = {}) {
  const before = snapshotFlowDebtState(repositoryRoot);
  const categories = FLOW_DEBT_VERIFICATION_CATEGORIES.map((category) =>
    category === "portable-core-authority"
      ? classifyPortableCore(portableCore)
      : classify(category, checks[category]),
  );
  const after = snapshotFlowDebtState(repositoryRoot);
  return {
    categories,
    readOnly: {
      status:
        JSON.stringify(before) === JSON.stringify(after) ? "pass" : "fail",
      before,
      after,
      reason: "before/after repository snapshots were compared",
    },
  };
}
