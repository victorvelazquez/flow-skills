export const BRANCH_PREFIX_ALIASES = new Map([
  ["feature", "feat"], ["bugfix", "fix"], ["bug", "fix"], ["doc", "docs"], ["tests", "test"],
]);

export const FLOW_COMMIT_INFERABLE_PREFIXES = new Set(["feat", "fix", "refactor", "chore", "docs", "test"]);

export function normalizeBranchPrefix(prefix) {
  const normalized = String(prefix || "").trim().toLowerCase();
  return BRANCH_PREFIX_ALIASES.get(normalized) || normalized;
}

export function normalizeBranchNameForCreation(branch, config, fallbackPrefix = "chore") {
  const raw = String(branch || "").trim().toLowerCase();
  const [candidate, ...rest] = raw.split("/");
  const prefix = normalizeBranchPrefix(candidate || fallbackPrefix);
  const slug = rest.join("-").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const normalizedFallback = FLOW_COMMIT_INFERABLE_PREFIXES.has(fallbackPrefix) ? fallbackPrefix : "chore";
  return `${config.branchPolicy.taskPrefixes.includes(prefix) ? prefix : normalizedFallback}/${slug || "auto-commit"}`;
}

export function classifyBranch(branch, config) {
  const value = String(branch || "").trim();
  if (config.branches.protected.includes(value)) {
    const integration = config.branches.integrationPreference.includes(value);
    return { valid: true, kind: integration ? "integration" : "protected", branch: value };
  }
  const match = value.match(/^([^/]+)\/(.+)$/);
  if (!match || !/^[a-z0-9][a-z0-9._-]*$/.test(match[2])) return { valid: false, kind: "unknown", branch: value, reason: "invalid-format" };
  const prefix = normalizeBranchPrefix(match[1]);
  if (prefix === "release") {
    const valid = /^\d+\.\d+\.\d+$/.test(match[2]);
    return { valid, kind: valid ? "release" : "unknown", prefix, branch: value };
  }
  if (prefix === "hotfix") return { valid: true, kind: "hotfix", prefix, branch: value };
  if (config.branchPolicy.taskPrefixes.includes(prefix)) return { valid: true, kind: "task", prefix, branch: value };
  return { valid: false, kind: "unknown", prefix, branch: value, reason: "unknown-prefix" };
}
