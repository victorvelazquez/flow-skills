import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildGenerationLock,
  generatePiProvenance,
  generateProvenance,
  ownedDestinationPaths,
  validateHostLock,
  verifyProvenance,
} from "../tools/lib/asset-generation.mjs";
import { validateHostManifest } from "../tools/lib/asset-contracts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

test("Pi provenance is reproducible, package-bound, and marker-free", () => {
  const first = generatePiProvenance(root);
  const second = generatePiProvenance(root);

  assert.deepEqual(second, first);
  assert.deepEqual(readJson("flow-generation.lock.json"), first.generationLock);
  assert.deepEqual(readJson("hosts/pi/flow-assets.lock.json"), first.hostLock);
  assert.equal(first.generationLock.$schema, "flow-generation-lock/v2");
  assert.match(first.generationLock.generationId, /^[a-f0-9]{64}$/);
  assert.equal(first.hostLock.$schema, "flow-host-assets-lock/v2");
  assert.equal(first.hostLock.host, "pi");
  assert.equal(first.hostLock.distribution.kind, "package-resources");
  assert.equal(Object.hasOwn(first.hostLock, "destination"), false);
  assert.equal(Object.hasOwn(first.hostLock, "marker"), false);
  assert.equal(first.hostLock.generationId, first.generationLock.generationId);
  assert.deepEqual(
    first.hostLock.records.map(({ source }) => source),
    [...first.hostLock.records.map(({ source }) => source)].sort(),
  );
  assert.ok(
    first.hostLock.records.every((record) =>
      first.generationLock.sources.some(
        (source) =>
          source.source === record.source &&
          source.sha256 === record.sha256 &&
          source.bytes === record.bytes,
      ),
    ),
  );
  assert.deepEqual(
    readJson("hosts/pi/flow-assets.json").sourceSelectors,
    readJson("package.json")
      .files.filter((entry) => !entry.endsWith(".lock.json"))
      .sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(first),
    /(?:capturedAt|timestamp|[A-Za-z]:\\|\/Users\/|credentials|token|secret)/i,
  );
});

test("Pi provenance covers canonical agents and prompts without claiming OpenCode ownership", () => {
  const result = generateProvenance({ root });
  const piLock = result.hostLocks.find(({ host }) => host === "pi");
  const expected = [
    "hosts/pi/agents/flow-branch.md",
    "hosts/pi/agents/flow-commit.md",
    "hosts/pi/agents/flow-pr.md",
    "hosts/pi/prompts/flow-branch.md",
    "hosts/pi/prompts/flow-commit.md",
    "hosts/pi/prompts/flow-pr.md",
  ];
  const piSources = piLock.records.map(({ source }) => source);

  for (const source of expected) {
    assert.ok(piSources.includes(source), `missing Pi provenance: ${source}`);
    assert.ok(
      result.generationLock.sources.some((record) => record.source === source),
      `missing common provenance: ${source}`,
    );
  }
  assert.equal(
    piSources.some((source) => source.startsWith("hosts/opencode/")),
    false,
  );
});

test("dual-host provenance shares one generation while retaining exact host ownership", () => {
  const result = generateProvenance({ root });
  const locks = new Map(result.hostLocks.map((lock) => [lock.host, lock]));
  const piLock = locks.get("pi");
  const opencodeLock = locks.get("opencode");

  assert.deepEqual([...locks.keys()], ["opencode", "pi"]);
  assert.equal(piLock.generationId, opencodeLock.generationId);
  assert.equal(piLock.generationId, result.generationLock.generationId);
  assert.notEqual(piLock.hostIdentity, opencodeLock.hostIdentity);
  assert.deepEqual(readJson("hosts/pi/flow-assets.lock.json"), piLock);
  assert.deepEqual(
    readJson("hosts/opencode/flow-assets.lock.json"),
    opencodeLock,
  );
  assert.deepEqual(
    result.generationLock.hosts.map(({ host }) => host),
    ["opencode", "pi"],
  );
  assert.deepEqual(
    opencodeLock.records.map(({ source, destination }) => ({
      source,
      destination,
    })),
    [...opencodeLock.records]
      .map(({ source, destination }) => ({ source, destination }))
      .sort((left, right) => {
        const leftKey = `${left.source}\0${left.destination}`;
        const rightKey = `${right.source}\0${right.destination}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      }),
  );
  assert.ok(opencodeLock.records.every(({ destination }) => destination));
  assert.ok(
    piLock.records.every(({ destination }) => destination === undefined),
  );
  for (const lock of [piLock, opencodeLock])
    assert.ok(
      lock.records.some(({ source }) => source === "core/workflows.json"),
      `${lock.host} provenance must include the portable workflow registry`,
    );
  assert.deepEqual(
    ownedDestinationPaths(opencodeLock),
    [...opencodeLock.records].map(({ destination }) => destination).sort(),
  );
  assert.equal(
    verifyProvenance(root).generationId,
    result.generationLock.generationId,
  );
});

test("destination ownership follows canonical destinations, not source ordering", () => {
  const lock = {
    host: "opencode",
    records: [
      {
        source: "core/flow-debt-contract.mjs",
        destination: "core/flow-debt-contract.mjs",
      },
      {
        source: "hosts/opencode/agents/flow-git-agent.md",
        destination: "agents/flow-git-agent.md",
      },
    ],
  };

  assert.deepEqual(ownedDestinationPaths(lock), [
    "agents/flow-git-agent.md",
    "core/flow-debt-contract.mjs",
  ]);
});

test("v2 locks reject cross-host destinations, tampering, and wildcard ownership", () => {
  const result = generateProvenance({ root });
  const generationLock = result.generationLock;
  const manifest = readJson("hosts/opencode/flow-assets.json");
  const lock = result.hostLocks.find(({ host }) => host === "opencode");

  assert.equal(
    validateHostLock({
      lock,
      manifest,
      generationLock,
      sourceRecords: lock.records,
    }),
    lock,
  );

  const crossHost = structuredClone(lock);
  crossHost.records[0].destination = "skills/flow-audit/SKILL.md";
  assert.throws(
    () =>
      validateHostLock({
        lock: crossHost,
        manifest,
        generationLock,
        sourceRecords: lock.records,
      }),
    /destination|ownership/i,
  );

  const tampered = structuredClone(lock);
  tampered.records[0].sha256 = "0".repeat(64);
  assert.throws(
    () =>
      validateHostLock({
        lock: tampered,
        manifest,
        generationLock,
        sourceRecords: lock.records,
      }),
    /record|identity|lock/i,
  );

  const wildcard = structuredClone(lock);
  wildcard.records[0].destination = "commands/**";
  assert.throws(() => ownedDestinationPaths(wildcard), /exact|wildcard/i);
});

test("v2 CLI verifies a selected host and rejects an unknown one", () => {
  const tool = path.join(root, "tools", "flow-assets.mjs");
  const verified = spawnSync(
    process.execPath,
    [tool, "--verify", "--host", "opencode"],
    {
      encoding: "utf8",
    },
  );
  assert.equal(verified.status, 0, verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout), {
    ok: true,
    host: "opencode",
    generationId: readJson("flow-generation.lock.json").generationId,
    hostIdentity: readJson("hosts/opencode/flow-assets.lock.json").hostIdentity,
    totals: readJson("hosts/opencode/flow-assets.lock.json").totals,
  });

  const invalid = spawnSync(
    process.execPath,
    [tool, "--verify", "--host", "other"],
    {
      encoding: "utf8",
    },
  );
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /--host pi or --host opencode/i);
});

test("canonical provenance changes for package or distributable-source drift", () => {
  const result = generatePiProvenance(root);
  const packageMetadata = readJson("package.json");
  const manifest = readJson("hosts/pi/flow-assets.json");

  const changedPackage = structuredClone(packageMetadata);
  changedPackage.version = "0.3.2";
  const packageDrift = buildGenerationLock({
    packageMetadata: changedPackage,
    hostManifests: [manifest],
    sourceRecords: result.sourceRecords,
  });
  assert.notEqual(
    packageDrift.generationId,
    result.generationLock.generationId,
  );

  const changedSources = structuredClone(result.sourceRecords);
  changedSources[0].sha256 = "0".repeat(64);
  const sourceDrift = buildGenerationLock({
    packageMetadata,
    hostManifests: [manifest],
    sourceRecords: changedSources,
  });
  assert.notEqual(sourceDrift.generationId, result.generationLock.generationId);
});

test("Pi provenance locks retain canonical bytes across checkout platforms", () => {
  const attributes = fs.readFileSync(path.join(root, ".gitattributes"), "utf8");
  for (const relative of [
    "flow-generation.lock.json",
    "hosts/pi/flow-assets.json",
    "hosts/pi/flow-assets.lock.json",
  ]) {
    assert.match(
      attributes,
      new RegExp(`^${relative.replaceAll("/", "\\/")} -text$`, "m"),
    );
  }
  assert.match(
    attributes,
    /^scripts\/lib\/flow-debt-writer\.mjs text eol=lf$/m,
  );
});

test("v2 host manifests reject timestamps, absolute paths, and sensitive fields", () => {
  const manifest = readJson("hosts/pi/flow-assets.json");

  for (const [field, value] of [
    ["capturedAt", "2026-07-23T12:00:00.000Z"],
    ["sourceSelectors", ["C:\\Users\\victor\\flow-skills"]],
    ["token", "not-a-secret-but-still-forbidden"],
  ]) {
    const invalid = structuredClone(manifest);
    invalid[field] = value;
    assert.throws(
      () => validateHostManifest(invalid),
      /forbidden|portable|absolute/i,
    );
  }
});
