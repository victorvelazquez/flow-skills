import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  assertExactPortablePath,
  assertSortedUnique,
  assertPortablePath,
  canonicalJson,
  publicPackageProjection,
  sha256,
  validateHostManifest,
} from "./asset-contracts.mjs";

const GENERATED_LOCKS = new Set([
  "flow-generation.lock.json",
  "hosts/opencode/flow-assets.lock.json",
  "hosts/pi/flow-assets.lock.json",
]);

function jsonDigest(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

function sameJson(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function canonicalWorkingBytes(root, source, target) {
  const bytes = fs.readFileSync(target);
  const attribute = spawnSync("git", ["check-attr", "eol", "--", source], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (!attribute.stdout?.endsWith(": eol: lf\n")) return bytes;
  return Buffer.from(bytes.toString("utf8").replaceAll("\r\n", "\n"));
}

function fileRecord(root, source, destination) {
  const target = path.join(root, ...source.split("/"));
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Package resource must be a regular file: ${source}`);
  const bytes = canonicalWorkingBytes(root, source, target);
  const executable = Boolean(stat.mode & 0o111);
  return {
    source,
    ...(destination === undefined ? {} : { destination }),
    sha256: sha256(bytes),
    bytes: bytes.length,
    mode: executable ? "100755" : "100644",
    executable,
  };
}

function collectDirectory(root, relative, output) {
  const directory = path.join(root, ...relative.split("/"));
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(`Package resource must be a directory: ${relative}`);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const source = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink())
      throw new Error(`Package resource cannot be a symlink: ${source}`);
    if (entry.isDirectory()) collectDirectory(root, source, output);
    else if (entry.isFile()) output.push(source);
    else throw new Error(`Unsupported package resource: ${source}`);
  }
}

function expandSelector(root, selector) {
  const relative = selector.endsWith("/**") ? selector.slice(0, -3) : selector;
  assertPortablePath(relative);
  const target = path.join(root, ...relative.split("/"));
  if (!fs.existsSync(target)) {
    if (GENERATED_LOCKS.has(relative)) return [];
    throw new Error(`Declared package resource is missing: ${relative}`);
  }
  if (!selector.endsWith("/**")) return [relative];
  const sources = [];
  collectDirectory(root, relative, sources);
  return sources;
}

function withoutDestination(record) {
  const { destination: _destination, ...source } = record;
  return source;
}

function validateRecord(record, { destination = false } = {}) {
  const fields = destination
    ? ["bytes", "destination", "executable", "mode", "sha256", "source"]
    : ["bytes", "executable", "mode", "sha256", "source"];
  if (
    !record ||
    typeof record !== "object" ||
    Object.keys(record).sort().join("\0") !== fields.join("\0")
  )
    throw new Error("Host lock record fields are invalid.");
  assertExactPortablePath(record.source);
  if (destination) assertExactPortablePath(record.destination);
  if (
    !/^[a-f0-9]{64}$/.test(record.sha256) ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes < 0 ||
    !["100644", "100755"].includes(record.mode) ||
    record.executable !== (record.mode === "100755")
  )
    throw new Error(`Invalid source record: ${record.source}`);
}

function validateSourceRecords(sourceRecords) {
  if (!Array.isArray(sourceRecords))
    throw new Error("Source records must be an array.");
  let previous = "";
  for (const record of sourceRecords) {
    validateRecord(record);
    if (previous >= record.source)
      throw new Error("Source records must be sorted and unique.");
    previous = record.source;
  }
  return sourceRecords;
}

function destinationForSource(mappings, source) {
  const matches = mappings.filter((mapping) =>
    mapping.source.endsWith("/**")
      ? source.startsWith(`${mapping.source.slice(0, -3)}/`)
      : mapping.source === source,
  );
  if (matches.length !== 1)
    throw new Error(
      "OpenCode source must have exactly one mapped destination.",
    );
  const [mapping] = matches;
  return mapping.source.endsWith("/**")
    ? `${mapping.destination.slice(0, -3)}/${source.slice(
        mapping.source.length - 2,
      )}`
    : mapping.destination;
}

function validateHostSourceRecords(manifest, sourceRecords) {
  if (!Array.isArray(sourceRecords))
    throw new Error("Host source records must be an array.");
  const hasDestination = manifest.host === "opencode";
  let previous = "";
  for (const record of sourceRecords) {
    validateRecord(record, { destination: hasDestination });
    const key = `${record.source}\0${record.destination || ""}`;
    if (previous >= key)
      throw new Error("Host records must be sorted and unique.");
    previous = key;
  }
  if (manifest.host === "opencode") {
    if (
      sourceRecords.some(
        ({ source, destination }) =>
          destinationForSource(manifest.mappings, source) !== destination,
      )
    )
      throw new Error(
        "OpenCode lock destinations do not exactly match host mappings.",
      );
  }
  return sourceRecords;
}

function manifestRecords(hostManifests) {
  return hostManifests
    .map(validateHostManifest)
    .map((manifest) => ({ host: manifest.host, sha256: jsonDigest(manifest) }))
    .sort((left, right) => left.host.localeCompare(right.host));
}

export function collectPackageSourceRecords(root, packageMetadata) {
  const projection = publicPackageProjection(packageMetadata);
  const files = projection.files.flatMap((selector) =>
    expandSelector(root, selector),
  );
  const sources = [...new Set(files)]
    .filter((source) => !GENERATED_LOCKS.has(source))
    .sort();
  return sources.map((source) => fileRecord(root, source));
}

export function collectHostSourceRecords(root, manifest) {
  validateHostManifest(manifest);
  const mappings = manifest.mappings || [];
  const sources = [
    ...new Set(
      manifest.sourceSelectors.flatMap((selector) =>
        expandSelector(root, selector),
      ),
    ),
  ].sort();
  const records = sources.map((source) =>
    fileRecord(
      root,
      source,
      manifest.host === "opencode"
        ? destinationForSource(mappings, source)
        : undefined,
    ),
  );
  return validateHostSourceRecords(manifest, records);
}

export function buildGenerationLock({
  packageMetadata,
  hostManifests,
  sourceRecords,
}) {
  const packageProjection = publicPackageProjection(packageMetadata);
  const hosts = manifestRecords(hostManifests);
  if (new Set(hosts.map(({ host }) => host)).size !== hosts.length)
    throw new Error("Host manifests must be unique.");
  const sources = validateSourceRecords(sourceRecords);
  const packageSha256 = jsonDigest(packageProjection);
  const payload = {
    schema: "flow-generation-payload/v2",
    package: { sha256: packageSha256 },
    hosts,
    sources,
  };
  return {
    $schema: "flow-generation-lock/v2",
    generationId: jsonDigest(payload),
    package: { sha256: packageSha256 },
    hosts,
    sources,
  };
}

export function buildHostLock({ manifest, generationLock, sourceRecords }) {
  validateHostManifest(manifest);
  if (generationLock?.$schema !== "flow-generation-lock/v2")
    throw new Error("Host lock requires a v2 common generation lock.");
  validateHostSourceRecords(manifest, sourceRecords);
  const manifestSha256 = jsonDigest(manifest);
  const totals = {
    bytes: sourceRecords.reduce((total, record) => total + record.bytes, 0),
    count: sourceRecords.length,
  };
  const payload = {
    schema: "flow-host-assets-lock-payload/v2",
    host: manifest.host,
    distribution: manifest.distribution,
    generationId: generationLock.generationId,
    manifest: { sha256: manifestSha256 },
    records: sourceRecords,
    totals,
  };
  return {
    $schema: "flow-host-assets-lock/v2",
    host: manifest.host,
    distribution: manifest.distribution,
    generationId: generationLock.generationId,
    manifest: { sha256: manifestSha256 },
    records: sourceRecords,
    totals,
    hostIdentity: jsonDigest(payload),
  };
}

export function validateHostLock({
  lock,
  manifest,
  generationLock,
  sourceRecords,
}) {
  validateHostManifest(manifest);
  validateHostSourceRecords(manifest, lock?.records);
  const expected = buildHostLock({ manifest, generationLock, sourceRecords });
  if (!sameJson(lock, expected))
    throw new Error("Host lock record, identity, or generation is invalid.");
  return lock;
}

export function ownedDestinationPaths(lock) {
  if (lock?.host !== "opencode" || !Array.isArray(lock.records))
    throw new Error("Only OpenCode host locks define destination ownership.");
  const destinations = lock.records.map(({ destination }) => destination);
  for (const destination of destinations) {
    if (typeof destination !== "string" || destination.includes("*"))
      throw new Error(
        "Destination ownership must be exact; wildcards are forbidden.",
      );
    assertExactPortablePath(destination);
  }
  assertSortedUnique([...destinations].sort(), "Owned destination paths");
  return [...destinations].sort();
}

export function validateOpenCodeAdapterMappings(manifest, registry) {
  if (manifest?.host !== "opencode" || !Array.isArray(manifest.mappings))
    throw new Error("OpenCode adapter mappings are required.");
  const supported = new Set(
    registry?.workflows
      ?.filter(({ hosts }) => hosts?.opencode === "supported")
      .map(({ id }) => id),
  );
  const adapters = manifest.mappings.filter(({ role }) => role === "adapter");
  for (const mapping of adapters)
    if (!supported.has(mapping.workflow))
      throw new Error(
        "OpenCode adapter claims an unsupported registry workflow.",
      );
  try {
    validateHostManifest(manifest);
  } catch (error) {
    if (
      /destination is outside host ownership|mappings must be sorted/i.test(
        error.message,
      )
    )
      throw new Error(
        "OpenCode mapped destination must remain under commands/, agents/, skills/, scripts/, or the two approved core debt modules.",
        {
          cause: error,
        },
      );
    throw error;
  }
  const mappedWorkflows = adapters.map(({ workflow }) => workflow);
  const declaredWorkflows = new Set(manifest.workflows);
  if (
    mappedWorkflows.length !== declaredWorkflows.size ||
    new Set(mappedWorkflows).size !== mappedWorkflows.length ||
    mappedWorkflows.some((workflow) => !declaredWorkflows.has(workflow))
  )
    throw new Error(
      "OpenCode adapter mappings must cover each declared workflow once.",
    );
  return manifest;
}

function readJson(root, relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, ...relative), "utf8"));
  } catch (cause) {
    throw new Error(`Unable to read provenance JSON: ${relative.join("/")}`, {
      cause,
    });
  }
}

function defaultHostManifests(root) {
  return [
    readJson(root, ["hosts", "opencode", "flow-assets.json"]),
    readJson(root, ["hosts", "pi", "flow-assets.json"]),
  ];
}

function unionSourceRecords(hostRecords) {
  const records = new Map();
  for (const record of hostRecords.flat()) {
    const source = withoutDestination(record);
    const prior = records.get(source.source);
    if (prior && !sameJson(prior, source))
      throw new Error(
        `Source record has inconsistent host bytes: ${source.source}`,
      );
    records.set(source.source, source);
  }
  return validateSourceRecords(
    [...records.values()].sort((left, right) =>
      left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
    ),
  );
}

export function generateProvenance({ root, packageMetadata, hostManifests }) {
  const metadata = packageMetadata ?? readJson(root, ["package.json"]);
  const manifests = hostManifests ?? defaultHostManifests(root);
  const hostRecords = manifests.map((manifest) =>
    collectHostSourceRecords(root, manifest),
  );
  const sourceRecords = unionSourceRecords(hostRecords);
  const generationLock = buildGenerationLock({
    packageMetadata: metadata,
    hostManifests: manifests,
    sourceRecords,
  });
  const hostLocks = manifests
    .map((manifest, index) =>
      buildHostLock({
        manifest,
        generationLock,
        sourceRecords: hostRecords[index],
      }),
    )
    .sort((left, right) => left.host.localeCompare(right.host));
  return { generationLock, hostLocks, sourceRecords };
}

export function generatePiProvenance(root) {
  const result = generateProvenance({ root });
  const hostLock = result.hostLocks.find(({ host }) => host === "pi");
  if (!hostLock) throw new Error("Pi provenance requires a Pi host manifest.");
  return { ...result, hostLock };
}

export function verifyProvenance(root) {
  const result = generateProvenance({ root });
  const generationLock = readJson(root, ["flow-generation.lock.json"]);
  if (!sameJson(generationLock, result.generationLock))
    throw new Error("Common generation lock is invalid or tampered.");
  for (const lock of result.hostLocks) {
    const persisted = readJson(root, [
      "hosts",
      lock.host,
      "flow-assets.lock.json",
    ]);
    const manifest = readJson(root, ["hosts", lock.host, "flow-assets.json"]);
    validateHostLock({
      lock: persisted,
      manifest,
      generationLock: result.generationLock,
      sourceRecords: lock.records,
    });
  }
  return result.generationLock;
}

export function writeProvenance(root) {
  const { generationLock, hostLocks } = generateProvenance({ root });
  fs.writeFileSync(
    path.join(root, "flow-generation.lock.json"),
    `${JSON.stringify(generationLock, null, 2)}\n`,
  );
  for (const lock of hostLocks) {
    fs.mkdirSync(path.join(root, "hosts", lock.host), { recursive: true });
    fs.writeFileSync(
      path.join(root, "hosts", lock.host, "flow-assets.lock.json"),
      `${JSON.stringify(lock, null, 2)}\n`,
    );
  }
  return { generationLock, hostLocks };
}

export function writePiProvenance(root) {
  const result = writeProvenance(root);
  const hostLock = result.hostLocks.find(({ host }) => host === "pi");
  return { ...result, hostLock };
}
