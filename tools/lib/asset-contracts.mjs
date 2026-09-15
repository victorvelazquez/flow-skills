import crypto from "node:crypto";
import path from "node:path";

const FORBIDDEN_FIELD = /(?:captured|timestamp|token|secret|credential)/i;
const FORBIDDEN_VALUE =
  /(?:[A-Za-z]:\\|^\/|\/Users\/|credentials|token|secret)/i;
const PORTABLE_CORE_MODULES = new Set([
  "core/flow-debt-backlog.mjs",
  "core/flow-debt-contract.mjs",
  "core/flow-debt-preparation.mjs",
]);

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value))
      throw new Error("Canonical JSON forbids non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object")
    throw new Error("Canonical JSON supports JSON values only.");
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function assertPortablePath(
  relative,
  { selector = false, protectedScope = false } = {},
) {
  const suffix = selector && relative.endsWith("/**") ? "/**" : "";
  const base = suffix ? relative.slice(0, -suffix.length) : relative;
  if (
    typeof relative !== "string" ||
    !base ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    (!selector && relative.includes("*")) ||
    (selector && relative.includes("*") && !suffix) ||
    base
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error(`Portable relative path required: ${relative}`);
  if (!protectedScope && FORBIDDEN_VALUE.test(relative))
    throw new Error(`Forbidden path value: ${relative}`);
  return relative;
}

export function assertExactPortablePath(relative) {
  return assertPortablePath(relative);
}

export function assertSortedUnique(values, label) {
  if (
    !Array.isArray(values) ||
    values.some((value, index) => index && values[index - 1] >= value)
  )
    throw new Error(`${label} must be sorted and unique.`);
}

function assertExactFields(value, fields, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join("\0") !== fields.join("\0")
  )
    throw new Error(`${label} fields are invalid.`);
}

function assertSafeValues(value, parentKey) {
  if (Array.isArray(value)) {
    if (["excludedScopes", "protectedScopes"].includes(parentKey)) return;
    return value.forEach((nested) => assertSafeValues(nested));
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_FIELD.test(key))
        throw new Error(`Forbidden provenance field: ${key}`);
      assertSafeValues(nested, key);
    }
    return;
  }
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value))
    throw new Error(`Forbidden provenance value: ${value}`);
}

function selectorOwns(selector, relative) {
  return selector.endsWith("/**")
    ? relative.startsWith(`${selector.slice(0, -3)}/`)
    : relative === selector;
}

function validateOpenCodeManifest(manifest) {
  const expected = [
    "$schema",
    "capabilities",
    "distribution",
    "excludedScopes",
    "host",
    "mappings",
    "protectedScopes",
    "sourceSelectors",
    "workflows",
  ];
  assertExactFields(manifest, expected, "OpenCode host manifest");
  if (manifest.distribution.kind !== "managed-deployment")
    throw new Error("OpenCode requires managed deployment.");
  assertSortedUnique(manifest.protectedScopes, "Protected scopes");
  assertSortedUnique(manifest.excludedScopes, "Excluded scopes");
  manifest.protectedScopes.forEach((scope) =>
    assertPortablePath(scope, { selector: true, protectedScope: true }),
  );
  manifest.excludedScopes.forEach((scope) =>
    assertPortablePath(scope, { selector: true, protectedScope: true }),
  );
  if (
    JSON.stringify(manifest.protectedScopes) !==
    JSON.stringify(manifest.excludedScopes)
  )
    throw new Error("Protected and excluded scopes must agree.");
  if (!Array.isArray(manifest.mappings))
    throw new Error("OpenCode mappings are required.");

  const mappingSources = [];
  const destinations = [];
  let previous = "";
  for (const mapping of manifest.mappings) {
    const fields =
      mapping?.role === "adapter"
        ? ["destination", "role", "source", "workflow"]
        : ["destination", "role", "source"];
    assertExactFields(mapping, fields, "OpenCode mapping");
    if (
      !["adapter", "agent", "legacy-adapter", "portable"].includes(mapping.role)
    )
      throw new Error("OpenCode mapping role is invalid.");
    if (
      mapping.role === "adapter" &&
      !/^(?:flow-[a-z0-9-]+|ui-design-system)$/.test(mapping.workflow)
    )
      throw new Error("OpenCode mapping workflow is invalid.");
    const isPortable = mapping.role === "portable";
    if (isPortable) {
      assertPortablePath(mapping.source, { selector: true });
      assertPortablePath(mapping.destination, { selector: true });
    } else {
      assertExactPortablePath(mapping.source);
      assertExactPortablePath(mapping.destination);
    }
    const key = `${mapping.source}\0${mapping.destination}`;
    if (previous >= key)
      throw new Error("OpenCode mappings must be sorted and unique.");
    previous = key;
    mappingSources.push(mapping.source);
    destinations.push(mapping.destination);
    const commandSource = "hosts/opencode/commands/";
    const agentSource = "hosts/opencode/agents/";
    const validCommand =
      mapping.source.startsWith(commandSource) &&
      mapping.destination ===
        `commands/${mapping.source.slice(commandSource.length)}` &&
      ["adapter", "legacy-adapter"].includes(mapping.role);
    const validAgent =
      mapping.source.startsWith(agentSource) &&
      mapping.destination ===
        `agents/${mapping.source.slice(agentSource.length)}` &&
      mapping.role === "agent";
    const validPortable =
      mapping.role === "portable" &&
      mapping.destination === mapping.source &&
      ((mapping.source.startsWith("skills/") &&
        mapping.source.endsWith("/**")) ||
        (mapping.source.startsWith("scripts/") &&
          !mapping.source.includes("*")) ||
        PORTABLE_CORE_MODULES.has(mapping.source));

    if (!validCommand && !validAgent && !validPortable)
      throw new Error(
        "OpenCode mapping destination is outside host ownership.",
      );
    if (
      manifest.protectedScopes.some((scope) =>
        selectorOwns(scope, mapping.destination),
      )
    )
      throw new Error("OpenCode mapping targets a protected scope.");
  }
  assertSortedUnique(destinations.sort(), "OpenCode mapped destinations");
  if (
    JSON.stringify(mappingSources.sort()) !==
    JSON.stringify(manifest.sourceSelectors)
  )
    throw new Error("OpenCode source selectors must exactly match mappings.");
}

export function validateHostManifest(manifest) {
  assertSafeValues(manifest);
  if (!manifest || manifest.$schema !== "flow-host-assets/v2")
    throw new Error("Invalid v2 host asset manifest.");
  if (!/^(?:pi|opencode)$/.test(manifest.host))
    throw new Error("Unsupported host manifest.");
  if (
    !manifest.distribution ||
    Object.keys(manifest.distribution).join("\0") !== "kind" ||
    !["package-resources", "managed-deployment"].includes(
      manifest.distribution.kind,
    )
  )
    throw new Error("Invalid host distribution.");
  assertSortedUnique(manifest.workflows, "Host workflows");
  if (
    manifest.workflows.some(
      (workflow) => !/^(?:flow-[a-z0-9-]+|ui-design-system)$/.test(workflow),
    )
  )
    throw new Error("Invalid host workflow.");
  assertSortedUnique(manifest.sourceSelectors, "Host source selectors");
  manifest.sourceSelectors.forEach((selector) =>
    assertPortablePath(selector, { selector: true }),
  );
  if (!manifest.capabilities || Object.keys(manifest.capabilities).length === 0)
    throw new Error("Host capabilities are required.");

  if (manifest.host === "pi") {
    assertExactFields(
      manifest,
      [
        "$schema",
        "capabilities",
        "distribution",
        "host",
        "sourceSelectors",
        "workflows",
      ],
      "Pi host manifest",
    );
    if (manifest.distribution.kind !== "package-resources")
      throw new Error("Pi requires package resources.");
  } else validateOpenCodeManifest(manifest);
  return manifest;
}

export function publicPackageProjection(packageMetadata) {
  const projection = {
    engines: packageMetadata?.engines,
    files: packageMetadata?.files,
    name: packageMetadata?.name,
    pi: packageMetadata?.pi,
    version: packageMetadata?.version,
  };
  if (
    typeof projection.name !== "string" ||
    typeof projection.version !== "string" ||
    projection.engines?.node !== ">=18" ||
    !Array.isArray(projection.files) ||
    !Array.isArray(projection.pi?.skills)
  )
    throw new Error("Invalid public package metadata projection.");
  assertSortedUnique(projection.files, "Package files");
  projection.files.forEach((entry) =>
    assertPortablePath(entry, { selector: true }),
  );
  assertSortedUnique(projection.pi.skills, "Pi skills");
  projection.pi.skills.forEach((entry) => assertPortablePath(entry));
  return projection;
}
