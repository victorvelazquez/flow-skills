const TYPE_BY_CHANGE = Object.freeze({
  feat: "type:feature", fix: "type:bug", docs: "type:docs", refactor: "type:refactor",
  chore: "type:chore", style: "type:chore", perf: "type:feature", test: "type:chore",
  build: "type:chore", ci: "type:chore", revert: "type:bug",
});
const TYPE_ALIASES = Object.freeze({ feature: "feat", hotfix: "fix", release: "chore", integration: "chore", spike: "chore" });

export function normalizeLabelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map((label) => typeof label === "string" ? label : label?.name)
    .filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim());
}

export function labelsForDelivery(input) {
  if (input.breaking) return ["type:breaking-change"];
  const rawType = input.changeType || input.commitType || input.prefix;
  const type = TYPE_ALIASES[rawType] || rawType;
  const typeLabel = TYPE_BY_CHANGE[type];
  if (!typeLabel) throw new Error(`No managed type label mapping for '${rawType}'.`);
  return [typeLabel];
}

export function buildLabelPlan(currentLabels, desiredLabels, availableLabels) {
  const current = new Set(normalizeLabelNames(currentLabels));
  const desired = new Set(desiredLabels);
  const available = new Set(normalizeLabelNames(availableLabels));
  const typeLabels = [...desired].filter((label) => label.startsWith("type:"));
  if (typeLabels.length !== 1) throw new Error(`Managed label policy requires exactly one type label, found ${typeLabels.length}.`);
  const missingDefinitions = [...desired].filter((label) => !available.has(label));
  if (missingDefinitions.length > 0) throw new Error(`Repository lacks expected managed label ${missingDefinitions.join(", ")}; create it explicitly before rerunning /flow-pr.`);
  const managedCurrent = [...current].filter((label) => label.startsWith("type:"));
  return { desired: [...desired], add: [...desired].filter((label) => !current.has(label)), remove: managedCurrent.filter((label) => !desired.has(label)), preserved: [...current].filter((label) => !label.startsWith("type:")) };
}

export function assertManagedLabelCardinality(labels, desiredLabels) {
  const names = normalizeLabelNames(labels);
  const types = names.filter((label) => label.startsWith("type:"));
  if (types.length !== 1 || types[0] !== desiredLabels.find((label) => label.startsWith("type:"))) throw new Error(`Managed label validation failed: expected one desired type label, found ${types.join(", ") || "none"}.`);
  for (const desired of desiredLabels) if (!names.includes(desired)) throw new Error(`Managed label validation failed: missing '${desired}'.`);
}
