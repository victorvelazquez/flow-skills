import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_DELIVERY_CONFIG = Object.freeze({
  branches: { protected: ["main", "master", "dev", "develop", "development", "staging", "production"], integrationPreference: ["development", "develop", "dev"], allowProjectUnprotectProduction: false },
  branchPolicy: { taskPrefixes: ["feat", "fix", "refactor", "chore", "docs", "test", "ci", "build", "perf", "style", "revert", "spike"], lifecyclePrefixes: ["hotfix", "release"] },
  labels: { createMissing: false },
  checkEvidence: { required: false, path: ".flow/check-evidence.json" },
  chain: { reviewBudget: 400, generatedPathPatterns: ["vendor/**", "**/vendor/**", "generated/**", "**/generated/**", "**/*.generated.*", "**/dist/**", "**/coverage/**"] },
});

const ROOT_KEYS = new Set(["branches", "branchPolicy", "labels", "checkEvidence", "chain"]);
const PRODUCTION_BRANCHES = ["main", "master", "staging", "production"];
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

export function deepMerge(base, override) {
  if (override === undefined) return structuredClone(base);
  if (Array.isArray(override)) return structuredClone(override);
  if (!isPlainObject(base) || !isPlainObject(override)) return structuredClone(override);
  const merged = structuredClone(base);
  for (const [key, value] of Object.entries(override)) merged[key] = key in merged ? deepMerge(merged[key], value) : structuredClone(value);
  return merged;
}

function assertExactKeys(value, allowed, location) {
  if (!isPlainObject(value)) throw new Error(`Invalid delivery config: ${location} must be an object.`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`Invalid delivery config: unknown ${location} key '${key}'.`);
}
function assertStringArray(value, location) {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || !entry.trim())) throw new Error(`Invalid delivery config: ${location} must be a non-empty string array.`);
  if (new Set(value).size !== value.length) throw new Error(`Invalid delivery config: ${location} contains duplicates.`);
}

export function validateDeliveryConfig(config) {
  if (!isPlainObject(config)) throw new Error("Invalid delivery config: root must be an object.");
  assertExactKeys(config, ROOT_KEYS, "root");
  assertExactKeys(config.branches, new Set(["protected", "integrationPreference", "allowProjectUnprotectProduction"]), "branches");
  assertStringArray(config.branches.protected, "branches.protected");
  assertStringArray(config.branches.integrationPreference, "branches.integrationPreference");
  if (typeof config.branches.allowProjectUnprotectProduction !== "boolean") throw new Error("Invalid delivery config: branches.allowProjectUnprotectProduction must be boolean.");
  assertExactKeys(config.branchPolicy, new Set(["taskPrefixes", "lifecyclePrefixes"]), "branchPolicy");
  assertStringArray(config.branchPolicy.taskPrefixes, "branchPolicy.taskPrefixes");
  assertStringArray(config.branchPolicy.lifecyclePrefixes, "branchPolicy.lifecyclePrefixes");
  for (const prefix of [...config.branchPolicy.taskPrefixes, ...config.branchPolicy.lifecyclePrefixes]) if (!/^[a-z][a-z0-9-]*$/.test(prefix)) throw new Error(`Invalid delivery config: branch prefix '${prefix}' is not canonical.`);
  assertExactKeys(config.labels, new Set(["createMissing"]), "labels");
  if (typeof config.labels.createMissing !== "boolean") throw new Error("Invalid delivery config: labels.createMissing must be boolean.");
  assertExactKeys(config.checkEvidence, new Set(["required", "path"]), "checkEvidence");
  if (typeof config.checkEvidence.required !== "boolean" || typeof config.checkEvidence.path !== "string" || !config.checkEvidence.path.trim()) throw new Error("Invalid delivery config: checkEvidence requires boolean required and string path.");
  assertExactKeys(config.chain, new Set(["reviewBudget", "generatedPathPatterns"]), "chain");
  if (!Number.isInteger(config.chain.reviewBudget) || config.chain.reviewBudget <= 0) throw new Error("Invalid delivery config: chain.reviewBudget must be a positive integer.");
  assertStringArray(config.chain.generatedPathPatterns, "chain.generatedPathPatterns");
  return config;
}

function readConfigFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { throw new Error(`Invalid delivery config '${filePath}': ${error.message}`); }
}

export function loadDeliveryConfig(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const globalPath = path.resolve(options.globalPath || path.join(os.homedir(), ".config", "opencode", "flow", "delivery.json"));
  const projectPath = path.resolve(options.projectPath || path.join(cwd, ".flow", "delivery.json"));
  let config = deepMerge(DEFAULT_DELIVERY_CONFIG, readConfigFile(globalPath) || {});
  validateDeliveryConfig(config);
  const projectConfig = readConfigFile(projectPath);
  if (projectConfig) {
    const projectMerged = deepMerge(config, projectConfig);
    validateDeliveryConfig(projectMerged);
    if (!config.branches.allowProjectUnprotectProduction) {
      const removed = PRODUCTION_BRANCHES.filter((branch) => config.branches.protected.includes(branch) && !projectMerged.branches.protected.includes(branch));
      if (removed.length > 0) throw new Error(`Project delivery config cannot unprotect production branches: ${removed.join(", ")}.`);
    }
    config = projectMerged;
  }
  return validateDeliveryConfig(deepMerge(config, options.explicit || {}));
}
