import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { canonicalJson, sha256 } from "./asset-contracts.mjs";
import {
  buildGenerationLock,
  ownedDestinationPaths,
  validateHostLock,
} from "./asset-generation.mjs";

const MARKER_PATH = ".flow-skills/hosts/opencode.json";
const CONTROL_ROOT = ".flow-skills/transactions/opencode-deploy";
const BACKUP_SCHEMA = "flow-host-deployment-backup/v2";
const PLAN_SCHEMA = "flow-host-deployment-plan/v2";
const JOURNAL_SCHEMA = "flow-host-deployment-transaction/v2";

function git(repoRoot, args, label) {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: null,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(
      `${label}: ${String(error.stderr || error.message).trim()}`,
    );
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (cause) {
    throw new Error(`${label} is malformed JSON.`, { cause });
  }
}

function assertPath(relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`Managed deployment path is invalid: ${relative}`);
  return relative;
}

function safePath(root, relative) {
  assertPath(relative);
  const target = path.resolve(root, ...relative.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error(`Managed deployment path escaped its root: ${relative}`);
  return target;
}

function assertNoSymlinks(root, relative) {
  let current = path.resolve(root);
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error(
        `Managed deployment path contains a symlink: ${relative}`,
      );
  }
}

function checkedPath(root, relative) {
  const target = safePath(root, relative);
  assertNoSymlinks(root, relative);
  return target;
}

function fileRecord(root, relative) {
  const target = checkedPath(root, relative);
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(
      `Managed deployment target is not a regular file: ${relative}`,
    );
  const bytes = fs.readFileSync(target);
  return {
    path: relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mode: stat.mode & 0o111 ? "100755" : "100644",
    executable: Boolean(stat.mode & 0o111),
  };
}

function sameRecord(actual, expected) {
  return (
    actual.path === expected.path &&
    actual.sha256 === expected.sha256 &&
    actual.bytes === expected.bytes &&
    (process.platform === "win32" ||
      (actual.mode === expected.mode &&
        actual.executable === expected.executable))
  );
}

function parseTree(bytes) {
  const entries = new Map();
  for (const token of Buffer.from(bytes).toString("utf8").split("\0")) {
    if (!token) continue;
    const tab = token.indexOf("\t");
    const match = token
      .slice(0, tab)
      .match(/^([0-7]{6}) (blob|tree) ([0-9a-f]{40,64})$/);
    const relative = token.slice(tab + 1);
    if (tab < 0 || !match || !relative || entries.has(relative))
      throw new Error("Historical deployment tree has a malformed entry.");
    entries.set(relative, { mode: match[1], type: match[2], oid: match[3] });
  }
  return entries;
}

function blob(repoRoot, tree, relative, label) {
  const entry = tree.get(relative);
  if (
    !entry ||
    entry.type !== "blob" ||
    !["100644", "100755"].includes(entry.mode)
  )
    throw new Error(`Historical ${label} is missing or invalid.`);
  return git(
    repoRoot,
    ["cat-file", "blob", entry.oid],
    `Cannot read historical ${label}`,
  );
}

function readGeneration(requestedRef, repoRoot) {
  if (typeof requestedRef !== "string" || !requestedRef)
    throw new Error("OpenCode deployment requires a non-empty ref.");
  const commit = git(
    repoRoot,
    ["rev-parse", "--verify", "--end-of-options", `${requestedRef}^{commit}`],
    `Cannot resolve deployment ref '${requestedRef}'`,
  )
    .toString("utf8")
    .trim();
  const treeId = git(
    repoRoot,
    ["rev-parse", "--verify", "--end-of-options", `${commit}^{tree}`],
    "Cannot freeze deployment target tree",
  )
    .toString("utf8")
    .trim();
  const tree = parseTree(
    git(
      repoRoot,
      ["ls-tree", "-r", "-z", "--full-tree", treeId],
      "Cannot read deployment tree",
    ),
  );
  if (!tree.has("hosts/opencode/flow-assets.json"))
    throw new Error(
      "Historical v1 generation requires the strict restore fallback.",
    );
  const packageMetadata = parseJson(
    blob(repoRoot, tree, "package.json", "package metadata"),
    "Historical package metadata",
  );
  const piManifest = parseJson(
    blob(repoRoot, tree, "hosts/pi/flow-assets.json", "Pi manifest"),
    "Historical Pi manifest",
  );
  const manifest = parseJson(
    blob(
      repoRoot,
      tree,
      "hosts/opencode/flow-assets.json",
      "OpenCode manifest",
    ),
    "Historical OpenCode manifest",
  );
  const generationLock = parseJson(
    blob(repoRoot, tree, "flow-generation.lock.json", "generation lock"),
    "Historical generation lock",
  );
  const piLock = parseJson(
    blob(repoRoot, tree, "hosts/pi/flow-assets.lock.json", "Pi lock"),
    "Historical Pi lock",
  );
  const lock = parseJson(
    blob(
      repoRoot,
      tree,
      "hosts/opencode/flow-assets.lock.json",
      "OpenCode lock",
    ),
    "Historical OpenCode lock",
  );
  if (
    generationLock?.$schema !== "flow-generation-lock/v2" ||
    lock?.host !== "opencode"
  )
    throw new Error("Historical v2 deployment authority is invalid.");
  const expectedGeneration = buildGenerationLock({
    packageMetadata,
    hostManifests: [manifest, piManifest],
    sourceRecords: generationLock.sources,
  });
  if (canonicalJson(expectedGeneration) !== canonicalJson(generationLock))
    throw new Error("Historical common generation lock is invalid.");
  const sources = new Map(
    generationLock.sources.map((record) => [record.source, record]),
  );
  for (const record of generationLock.sources) {
    assertPath(record.source);
    const bytes = blob(
      repoRoot,
      tree,
      record.source,
      `source ${record.source}`,
    );
    if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256)
      throw new Error(
        `Historical generation source mismatch: ${record.source}`,
      );
  }
  for (const [candidate, candidateManifest] of [
    [lock, manifest],
    [piLock, piManifest],
  ]) {
    const records = candidate.records.map((record) => {
      const { destination, ...source } = record;
      const known = sources.get(source.source);
      if (!known || canonicalJson(known) !== canonicalJson(source))
        throw new Error(
          "Historical host lock source is not in the generation lock.",
        );
      return record;
    });
    validateHostLock({
      lock: candidate,
      manifest: candidateManifest,
      generationLock,
      sourceRecords: records,
    });
  }
  return { commit, treeId, tree, generationLock, lock, manifest };
}

function markerPath(destinationRoot) {
  return safePath(destinationRoot, MARKER_PATH);
}

function readMarker(destinationRoot) {
  const target = markerPath(destinationRoot);
  if (!fs.existsSync(target)) {
    if (fs.existsSync(path.dirname(target)))
      throw new Error(
        "OpenCode installed marker is missing; deployment fails closed.",
      );
    return null;
  }
  let marker;
  try {
    marker = JSON.parse(fs.readFileSync(target, "utf8"));
  } catch (cause) {
    throw new Error(
      "OpenCode installed marker is malformed; deployment fails closed.",
      { cause },
    );
  }
  const fields = [
    "$schema",
    "generationId",
    "host",
    "hostIdentity",
    "ownedDestinationPaths",
    "planId",
    "targetCommit",
    "targetTree",
  ];
  if (
    !marker ||
    Object.keys(marker).sort().join("\0") !== fields.join("\0") ||
    marker.$schema !== "flow-host-install/v2" ||
    marker.host !== "opencode" ||
    !Array.isArray(marker.ownedDestinationPaths) ||
    marker.ownedDestinationPaths.some((entry) => assertPath(entry) !== entry) ||
    marker.ownedDestinationPaths.some(
      (entry, index, values) => index && values[index - 1] >= entry,
    ) ||
    !/^[a-f0-9]{40,64}$/.test(marker.targetCommit) ||
    !/^[a-f0-9]{40,64}$/.test(marker.targetTree) ||
    !/^[a-f0-9]{64}$/.test(marker.generationId) ||
    !/^[a-f0-9]{64}$/.test(marker.hostIdentity) ||
    !/^[a-f0-9]{64}$/.test(marker.planId)
  )
    throw new Error(
      "OpenCode installed marker is invalid; deployment fails closed.",
    );
  return { marker, digest: sha256(fs.readFileSync(target)) };
}

function immutablePriorOwnership(installed, repoRoot) {
  if (!installed) return [];
  const prior = readGeneration(installed.marker.targetCommit, repoRoot);
  const owned = ownedDestinationPaths(prior.lock);
  if (
    installed.marker.targetTree !== prior.treeId ||
    installed.marker.generationId !== prior.generationLock.generationId ||
    installed.marker.hostIdentity !== prior.lock.hostIdentity ||
    canonicalJson(installed.marker.ownedDestinationPaths) !==
      canonicalJson(owned)
  )
    throw new Error(
      "OpenCode installed marker ownership does not match its immutable repository generation.",
    );
  return owned;
}

function protectedTarget(manifest, relative) {
  return manifest.protectedScopes.some((scope) =>
    scope.endsWith("/**")
      ? relative.startsWith(`${scope.slice(0, -3)}/`)
      : relative === scope,
  );
}

function currentState(destinationRoot, scope) {
  return scope.map((relative) => {
    const target = checkedPath(destinationRoot, relative);
    return fs.existsSync(target) ? fileRecord(destinationRoot, relative) : null;
  });
}

function buildPlan(generation, destinationRoot, requestedRef, repoRoot) {
  const installed = readMarker(destinationRoot);
  const priorOwned = immutablePriorOwnership(installed, repoRoot);
  const targetRecords = generation.lock.records.map((record) => ({
    ...record,
    path: record.destination,
  }));
  const targetPaths = targetRecords.map(({ path }) => path);
  if (targetPaths.some((entry) => protectedTarget(generation.manifest, entry)))
    throw new Error("OpenCode deployment target is in a protected scope.");
  const priorSet = new Set(priorOwned);
  const targetSet = new Set(targetPaths);
  const scope = [...new Set([...priorOwned, ...targetPaths])].sort();
  const current = currentState(destinationRoot, scope);
  const currentByPath = new Map(
    scope.map((entry, index) => [entry, current[index]]),
  );
  for (const relative of targetPaths)
    if (currentByPath.get(relative) && !priorSet.has(relative))
      throw new Error(
        `OpenCode deployment collision with unowned target: ${relative}`,
      );
  const add = targetPaths.filter((relative) => !currentByPath.get(relative));
  const change = targetRecords
    .filter(
      (record) =>
        currentByPath.get(record.path) &&
        !sameRecord(currentByPath.get(record.path), record),
    )
    .map(({ path: relative }) => relative);
  const remove = priorOwned.filter(
    (relative) => !targetSet.has(relative) && currentByPath.get(relative),
  );
  const operations = [
    ...add.map((path) => ({ action: "add", path })),
    ...change.map((path) => ({ action: "change", path })),
    ...remove.map((path) => ({ action: "delete", path })),
  ];
  const identity = {
    schema: PLAN_SCHEMA,
    host: "opencode",
    distribution: generation.lock.distribution,
    requestedRef,
    targetCommit: generation.commit,
    targetTree: generation.treeId,
    generationId: generation.generationLock.generationId,
    hostIdentity: generation.lock.hostIdentity,
    generationLock: sha256(canonicalJson(generation.generationLock)),
    hostLock: sha256(canonicalJson(generation.lock)),
    destinationRoot: fs.realpathSync(destinationRoot),
    marker: installed?.digest || null,
    priorOwned,
    current,
    operations,
    backupSchema: BACKUP_SCHEMA,
  };
  const planId = sha256(canonicalJson(identity));
  return {
    schema: PLAN_SCHEMA,
    host: "opencode",
    planId,
    requestedRef,
    applySupported: true,
    requiredApplyIds: { targetCommit: generation.commit, planId },
    target: {
      commit: generation.commit,
      tree: generation.treeId,
      generationId: generation.generationLock.generationId,
      hostIdentity: generation.lock.hostIdentity,
      records: targetRecords,
      totals: generation.lock.totals,
    },
    current: { marker: installed?.marker || null, files: current },
    counts: { add: add.length, change: change.length, delete: remove.length },
    add,
    change,
    delete: remove,
    operations,
  };
}

export function buildOpenCodeDeployPlan({
  requestedRef,
  destinationRoot,
  repoRoot,
}) {
  const destination = path.resolve(destinationRoot);
  if (!fs.existsSync(destination) || !fs.statSync(destination).isDirectory())
    throw new Error(
      `OpenCode destination directory does not exist: ${destination}`,
    );
  const repository = path.resolve(repoRoot);
  if (!fs.existsSync(repository) || !fs.statSync(repository).isDirectory())
    throw new Error(`Flow repository directory does not exist: ${repository}`);
  const control = safePath(destination, CONTROL_ROOT);
  if (fs.existsSync(path.join(control, "transaction")))
    throw new Error(
      "Incomplete OpenCode deployment transaction blocks preview.",
    );
  return buildPlan(
    readGeneration(requestedRef, repository),
    destination,
    requestedRef,
    repository,
  );
}

function atomicWrite(target, bytes, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  if (mode) fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, target);
}

function deploymentRoot(destinationRoot) {
  return safePath(destinationRoot, CONTROL_ROOT);
}

function acquire(destinationRoot) {
  const root = deploymentRoot(destinationRoot);
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, "apply.lock");
  try {
    fs.mkdirSync(lock);
  } catch (cause) {
    if (cause.code === "EEXIST")
      throw new Error("OpenCode deployment already in progress.");
    throw cause;
  }
  return { root, lock };
}

function release(transaction) {
  fs.rmSync(transaction.lock, { recursive: true, force: true });
}

function stateEntries(destinationRoot, paths) {
  return paths.map((relative) => {
    const target = checkedPath(destinationRoot, relative);
    return {
      path: relative,
      exists: fs.existsSync(target),
      record: fs.existsSync(target)
        ? fileRecord(destinationRoot, relative)
        : null,
    };
  });
}

function verifyState(destinationRoot, records, scope) {
  const expected = new Map(records.map((record) => [record.path, record]));
  for (const relative of scope) {
    const actual = checkedPath(destinationRoot, relative);
    if (!expected.has(relative)) {
      if (fs.existsSync(actual))
        throw new Error(`Unexpected managed deployment asset: ${relative}`);
    } else if (
      !fs.existsSync(actual) ||
      !sameRecord(fileRecord(destinationRoot, relative), expected.get(relative))
    )
      throw new Error(`OpenCode deployment postcondition failed: ${relative}`);
  }
}

function createBackup(destinationRoot, entries, plan) {
  const root = safePath(destinationRoot, ".flow-skills/backups");
  fs.mkdirSync(root, { recursive: true });
  const backupId = `deploy-${plan.planId.slice(0, 16)}`;
  const final = path.join(root, backupId);
  if (fs.existsSync(final))
    throw new Error("OpenCode deployment backup already exists for this plan.");
  const partial = `${final}.partial-${process.pid}`;
  fs.mkdirSync(partial);
  try {
    for (const entry of entries.filter(({ exists }) => exists)) {
      const copied = safePath(partial, `files/${entry.path}`);
      fs.mkdirSync(path.dirname(copied), { recursive: true });
      fs.copyFileSync(checkedPath(destinationRoot, entry.path), copied);
      if (
        !sameRecord(fileRecord(partial, `files/${entry.path}`), {
          ...entry.record,
          path: `files/${entry.path}`,
        })
      )
        throw new Error(
          `OpenCode deployment backup verification failed: ${entry.path}`,
        );
    }
    const backup = {
      $schema: BACKUP_SCHEMA,
      backupId,
      planId: plan.planId,
      scopePaths: entries.map(({ path }) => path),
      entries,
    };
    atomicWrite(
      path.join(partial, "backup.json"),
      `${JSON.stringify(backup, null, 2)}\n`,
    );
    fs.renameSync(partial, final);
    return { backupId, backupPath: final, backup };
  } catch (error) {
    fs.rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}

function recover(destinationRoot, root) {
  const transaction = path.join(root, "transaction");
  if (!fs.existsSync(transaction)) return false;
  const journal = parseJson(
    fs.readFileSync(path.join(transaction, "journal.json")),
    "OpenCode deployment journal",
  );
  if (
    journal?.$schema !== JOURNAL_SCHEMA ||
    !Array.isArray(journal.entries) ||
    typeof journal.backupPath !== "string"
  )
    throw new Error(
      "Invalid OpenCode deployment journal; recovery evidence is preserved.",
    );
  for (const entry of journal.entries) {
    const target = checkedPath(destinationRoot, entry.path);
    if (!entry.exists) {
      fs.rmSync(target, { force: true });
      continue;
    }
    const source = safePath(journal.backupPath, `files/${entry.path}`);
    if (!fs.existsSync(source))
      throw new Error(
        `OpenCode deployment recovery evidence is incomplete: ${entry.path}`,
      );
    atomicWrite(
      target,
      fs.readFileSync(source),
      entry.record.executable ? 0o755 : 0o644,
    );
    if (!sameRecord(fileRecord(destinationRoot, entry.path), entry.record))
      throw new Error(
        `OpenCode deployment recovery failed verification: ${entry.path}`,
      );
  }
  fs.rmSync(transaction, { recursive: true });
  return true;
}

function expectedPlan(options) {
  if (!options.expectedTargetCommit || !options.expectedPlanId)
    throw new Error(
      "OpenCode deploy apply requires --expected-target-commit and --expected-plan-id.",
    );
  const plan = buildOpenCodeDeployPlan(options);
  if (plan.target.commit !== options.expectedTargetCommit)
    throw new Error(
      `OpenCode deployment target commit changed: expected ${options.expectedTargetCommit}, current ${plan.target.commit}.`,
    );
  if (plan.planId !== options.expectedPlanId)
    throw new Error(
      `Stale OpenCode deployment plan ID: expected ${options.expectedPlanId}, current ${plan.planId}.`,
    );
  return plan;
}

function markerFor(plan) {
  return {
    $schema: "flow-host-install/v2",
    host: "opencode",
    generationId: plan.target.generationId,
    hostIdentity: plan.target.hostIdentity,
    targetCommit: plan.target.commit,
    targetTree: plan.target.tree,
    planId: plan.planId,
    ownedDestinationPaths: plan.target.records.map(({ path }) => path).sort(),
  };
}

export function applyOpenCodeDeploy(input, hooks = {}) {
  const options = { ...input, ...hooks };
  let plan = expectedPlan(options);
  const transaction = acquire(path.resolve(options.destinationRoot));
  let backup;
  try {
    recover(path.resolve(options.destinationRoot), transaction.root);
    plan = expectedPlan(options);
    options.afterLock?.();
    plan = expectedPlan(options);
    const generation = readGeneration(
      options.requestedRef,
      path.resolve(options.repoRoot),
    );
    const frozen = new Map(
      generation.lock.records.map((record) => {
        const bytes = blob(
          path.resolve(options.repoRoot),
          generation.tree,
          record.source,
          `source ${record.source}`,
        );
        if (sha256(bytes) !== record.sha256 || bytes.length !== record.bytes)
          throw new Error(
            `OpenCode deployment source drifted: ${record.source}`,
          );
        return [record.path || record.destination, bytes];
      }),
    );
    plan = expectedPlan(options);
    const marker = markerFor(plan);
    const assetScope = [
      ...new Set([
        ...plan.add,
        ...plan.change,
        ...plan.delete,
        ...plan.target.records.map(({ path }) => path),
      ]),
    ].sort();
    const entries = stateEntries(
      path.resolve(options.destinationRoot),
      [...assetScope, MARKER_PATH].sort(),
    );
    backup = createBackup(path.resolve(options.destinationRoot), entries, plan);
    options.afterBackup?.();
    plan = expectedPlan(options);
    const directory = path.join(transaction.root, "transaction");
    fs.mkdirSync(directory);
    atomicWrite(
      path.join(directory, "journal.json"),
      JSON.stringify({
        $schema: JOURNAL_SCHEMA,
        backupPath: backup.backupPath,
        entries,
      }),
    );
    for (const record of plan.target.records) {
      const staged = safePath(directory, `staged/${record.path}`);
      atomicWrite(
        staged,
        frozen.get(record.path),
        record.executable ? 0o755 : 0o644,
      );
      if (
        !sameRecord(fileRecord(directory, `staged/${record.path}`), {
          ...record,
          path: `staged/${record.path}`,
        })
      )
        throw new Error(
          `OpenCode deployment staging verification failed: ${record.path}`,
        );
    }
    for (const relative of [...plan.add, ...plan.change]) {
      const record = plan.target.records.find(({ path }) => path === relative);
      atomicWrite(
        checkedPath(path.resolve(options.destinationRoot), relative),
        frozen.get(relative),
        record.executable ? 0o755 : 0o644,
      );
    }
    for (const relative of plan.delete)
      fs.rmSync(checkedPath(path.resolve(options.destinationRoot), relative), {
        force: true,
      });
    options.afterWrites?.();
    verifyState(
      path.resolve(options.destinationRoot),
      plan.target.records,
      assetScope,
    );
    atomicWrite(
      markerPath(path.resolve(options.destinationRoot)),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
    if (
      canonicalJson(
        readMarker(path.resolve(options.destinationRoot)).marker,
      ) !== canonicalJson(marker)
    )
      throw new Error("OpenCode deployment marker postcondition failed.");
    fs.rmSync(directory, { recursive: true });
    return {
      ok: true,
      verified: true,
      planId: plan.planId,
      targetCommit: plan.target.commit,
      targetTree: plan.target.tree,
      counts: plan.counts,
      totals: plan.target.totals,
      backupId: backup.backupId,
      backupPath: backup.backupPath,
    };
  } catch (error) {
    try {
      recover(path.resolve(options.destinationRoot), transaction.root);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        "OpenCode deployment failed and recovery evidence was preserved.",
      );
    }
    throw error;
  } finally {
    release(transaction);
  }
}
