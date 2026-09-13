import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson, sha256 } from "./asset-contracts.mjs";
import { verifyProvenance, writeProvenance } from "./asset-generation.mjs";

const CONTROL_BASE = path.join(os.tmpdir(), "flow-assets-reconciliation");
const JOURNAL_SCHEMA = "flow-assets-reconciliation-transaction/v1";
const PROVENANCE_PATHS = [
  "flow-generation.lock.json",
  "hosts/opencode/flow-assets.lock.json",
  "hosts/pi/flow-assets.lock.json",
];

function readJson(root, relative, label) {
  try {
    return JSON.parse(fs.readFileSync(safePath(root, relative), "utf8"));
  } catch (cause) {
    throw new Error(`${label} is malformed or missing.`, { cause });
  }
}

function gitCommit(repoRoot) {
  try {
    return execFileSync(
      "git",
      ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (cause) {
    throw new Error(
      "Reconciliation requires a repository with a readable HEAD commit.",
      {
        cause,
      },
    );
  }
}

function assertDirectory(root, label) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error(`${label} does not exist: ${root}`);
  if (fs.lstatSync(root).isSymbolicLink())
    throw new Error(`${label} cannot be a symlink: ${root}`);
}

function assertRelative(relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  )
    throw new Error(`Reconciliation path is invalid: ${relative}`);
  return relative;
}

function safePath(root, relative) {
  assertRelative(relative);
  const target = path.resolve(root, ...relative.split("/"));
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error(`Reconciliation path escaped its root: ${relative}`);
  let current = root;
  for (const segment of relative.split("/")) {
    current = path.join(current, segment);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error(`Reconciliation path contains a symlink: ${relative}`);
  }
  return target;
}

function record(root, relative) {
  const target = safePath(root, relative);
  if (!fs.existsSync(target)) return null;
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink())
    throw new Error(`Reconciliation asset is not a regular file: ${relative}`);
  const bytes = fs.readFileSync(target);
  return {
    path: relative,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mode: stat.mode & 0o111 ? "100755" : "100644",
    executable: Boolean(stat.mode & 0o111),
  };
}

function sameRecord(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function sameContentRecord(left, right) {
  return (
    left.sha256 === right.sha256 &&
    left.bytes === right.bytes &&
    left.mode === right.mode &&
    left.executable === right.executable
  );
}

function reconciliationRoot(repoRoot) {
  return path.join(CONTROL_BASE, sha256(fs.realpathSync(repoRoot)));
}

function atomicWrite(target, bytes, mode) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  if (mode) fs.chmodSync(temporary, mode);
  fs.renameSync(temporary, target);
}

function acquire(repoRoot) {
  const root = reconciliationRoot(repoRoot);
  fs.mkdirSync(root, { recursive: true });
  const lock = path.join(root, "apply.lock");
  try {
    fs.mkdirSync(lock);
  } catch (cause) {
    if (cause.code !== "EEXIST") throw cause;
    throw new Error("Reconciliation apply already in progress.");
  }
  atomicWrite(
    path.join(lock, "owner.json"),
    JSON.stringify({ pid: process.pid }),
  );
  return { root, lock };
}

function release(transaction) {
  fs.rmSync(transaction.lock, { recursive: true, force: true });
  if (
    fs.existsSync(transaction.root) &&
    fs.readdirSync(transaction.root).length === 0
  )
    fs.rmdirSync(transaction.root);
}

function preimages(repoRoot, paths) {
  return paths.map((relative) => {
    const source = safePath(repoRoot, relative);
    const exists = fs.existsSync(source);
    return {
      path: relative,
      exists,
      record: exists ? record(repoRoot, relative) : null,
    };
  });
}

function verifyPreimages(repoRoot, entries) {
  for (const entry of entries) {
    const target = safePath(repoRoot, entry.path);
    if (!entry.exists) {
      if (fs.existsSync(target))
        throw new Error(
          `Reconciliation rollback left an unexpected file: ${entry.path}`,
        );
    } else if (
      !fs.existsSync(target) ||
      !sameRecord(record(repoRoot, entry.path), entry.record)
    )
      throw new Error(
        `Reconciliation rollback failed verification: ${entry.path}`,
      );
  }
}

function recover(repoRoot, transactionRoot) {
  const directory = path.join(transactionRoot, "transaction");
  if (!fs.existsSync(directory)) return false;
  let journal;
  try {
    journal = JSON.parse(
      fs.readFileSync(path.join(directory, "journal.json"), "utf8"),
    );
  } catch (cause) {
    throw new Error(
      "Reconciliation journal is invalid; recovery evidence is preserved.",
      {
        cause,
      },
    );
  }
  if (journal?.$schema !== JOURNAL_SCHEMA || !Array.isArray(journal.entries))
    throw new Error(
      "Reconciliation journal is invalid; recovery evidence is preserved.",
    );
  for (let index = journal.entries.length - 1; index >= 0; index -= 1) {
    const entry = journal.entries[index];
    const target = safePath(repoRoot, entry.path);
    if (!entry.exists) {
      fs.rmSync(target, { force: true });
      continue;
    }
    const backup = safePath(directory, `preimages/${entry.path}`);
    if (!fs.existsSync(backup))
      throw new Error(
        `Reconciliation recovery evidence is missing: ${entry.path}`,
      );
    atomicWrite(
      target,
      fs.readFileSync(backup),
      entry.record.executable ? 0o755 : 0o644,
    );
  }
  verifyPreimages(repoRoot, journal.entries);
  fs.rmSync(directory, { recursive: true });
  return true;
}

function manifestFor(host, repoRoot) {
  if (!/^(?:pi|opencode)$/.test(host))
    throw new Error("Reconciliation requires --host pi or --host opencode.");
  return readJson(
    repoRoot,
    `hosts/${host}/flow-assets.json`,
    `${host} host manifest`,
  );
}

function compareRecords(sourceRoot, repositoryRoot, source, destination) {
  const live = record(sourceRoot, source);
  const repository = record(repositoryRoot, destination);
  if (!live && !repository) return null;
  if (!live) return { action: "delete", source, destination };
  if (!repository) return { action: "add", source, destination };
  return sameContentRecord(live, repository)
    ? null
    : { action: "change", source, destination };
}

function mappingRecords(manifest, repository) {
  const mappings = manifest.mappings || [];
  const wildcardMappings = mappings.filter(
    ({ source, destination }) =>
      source.includes("*") || destination.includes("*"),
  );
  if (!wildcardMappings.length) return mappings;
  const lock = readJson(
    repository,
    "hosts/opencode/flow-assets.lock.json",
    "OpenCode host lock",
  );
  if (!Array.isArray(lock.records))
    throw new Error("OpenCode host lock records are invalid.");
  const expanded = mappings.flatMap((mapping) => {
    if (!mapping.source.includes("*") && !mapping.destination.includes("*"))
      return [mapping];
    const sourcePrefix = mapping.source.replace(/\*\*$/, "");
    const destinationPrefix = mapping.destination.replace(/\*\*$/, "");
    return lock.records
      .filter(
        ({ source, destination }) =>
          source.startsWith(sourcePrefix) &&
          destination.startsWith(destinationPrefix),
      )
      .map(({ source, destination }) => ({ ...mapping, source, destination }));
  });
  return expanded.sort((left, right) =>
    `${left.source}\0${left.destination}`.localeCompare(
      `${right.source}\0${right.destination}`,
    ),
  );
}

function reportOnlyControls(host, sourceRoot, repositoryRoot) {
  return [
    ...new Set([
      "flow-generation.lock.json",
      `hosts/${host}/flow-assets.json`,
      ...PROVENANCE_PATHS,
    ]),
  ]
    .map((relative) => {
      if (!record(sourceRoot, relative)) return null;
      return compareRecords(sourceRoot, repositoryRoot, relative, relative);
    })
    .filter(Boolean);
}

export function buildReconciliationPlan({ host, sourceRoot, repoRoot }) {
  if (!path.isAbsolute(sourceRoot))
    throw new Error("Reconciliation --source must be an absolute path.");
  const source = path.resolve(sourceRoot);
  const repository = path.resolve(repoRoot);
  assertDirectory(source, "Reconciliation source directory");
  assertDirectory(repository, "Flow repository directory");
  const manifest = manifestFor(host, repository);
  const mappings =
    host === "opencode" ? mappingRecords(manifest, repository) : [];
  const importable = mappings.filter(({ role }) =>
    ["adapter", "agent"].includes(role),
  );
  const reportable = mappings.filter(
    ({ role }) => !["adapter", "agent"].includes(role),
  );
  const operations = importable
    .map(({ source: repositoryPath, destination: livePath }) =>
      compareRecords(source, repository, livePath, repositoryPath),
    )
    .filter(Boolean)
    .sort((left, right) => left.destination.localeCompare(right.destination));
  const reportOnly = [
    ...reportable.map(({ source: repositoryPath, destination: livePath }) =>
      compareRecords(source, repository, livePath, repositoryPath),
    ),
    ...reportOnlyControls(host, source, repository),
  ]
    .filter(Boolean)
    .sort((left, right) => left.destination.localeCompare(right.destination));
  const adapterState = importable.map(
    ({ source: repositoryPath, destination: livePath }) => ({
      source: livePath,
      destination: repositoryPath,
      live: record(source, livePath),
      repository: record(repository, repositoryPath),
    }),
  );
  const provenance = PROVENANCE_PATHS.map((relative) =>
    record(repository, relative),
  );
  const identity = {
    schema: "flow-assets-reconciliation-plan/v1",
    host,
    direction: "live host -> repository",
    sourceRoot: fs.realpathSync(source),
    repositoryRoot: fs.realpathSync(repository),
    repositoryCommit: gitCommit(repository),
    manifest: sha256(
      fs.readFileSync(safePath(repository, `hosts/${host}/flow-assets.json`)),
    ),
    adapterState,
    reportOnly,
    provenance,
    operations,
  };
  const planId = sha256(canonicalJson(identity));
  return {
    schema: identity.schema,
    host,
    direction: identity.direction,
    source: fs.realpathSync(source),
    repositoryCommit: identity.repositoryCommit,
    planId,
    applySupported: host === "opencode" && operations.length > 0,
    requiredApplyIds: { repositoryCommit: identity.repositoryCommit, planId },
    counts: {
      add: operations.filter(({ action }) => action === "add").length,
      change: operations.filter(({ action }) => action === "change").length,
      delete: operations.filter(({ action }) => action === "delete").length,
      reportOnly: reportOnly.length,
    },
    operations,
    reportOnly,
  };
}

function expectedPlan(options) {
  if (!options.expectedRepositoryCommit || !options.expectedPlanId)
    throw new Error(
      "Reconciliation apply requires --expected-repository-commit and --expected-plan-id.",
    );
  if (options.approved !== true)
    throw new Error(
      "Reconciliation apply requires a fresh host-native approval boundary.",
    );
  const plan = buildReconciliationPlan(options);
  if (plan.repositoryCommit !== options.expectedRepositoryCommit)
    throw new Error(
      `Reconciliation repository commit changed: expected ${options.expectedRepositoryCommit}, current ${plan.repositoryCommit}.`,
    );
  if (plan.planId !== options.expectedPlanId)
    throw new Error(
      `Stale reconciliation plan ID: expected ${options.expectedPlanId}, current ${plan.planId}.`,
    );
  if (!plan.applySupported)
    throw new Error(
      "Reconciliation plan has no importable adapter changes to apply.",
    );
  return plan;
}

export function applyReconciliation(input, hooks = {}) {
  const options = { ...input, ...hooks };
  const repository = path.resolve(options.repoRoot);
  const source = path.resolve(options.sourceRoot);
  let plan = expectedPlan(options);
  const transaction = acquire(repository);
  try {
    recover(repository, transaction.root);
    plan = expectedPlan(options);
    options.afterLock?.();
    plan = expectedPlan(options);
    const frozen = new Map(
      plan.operations
        .filter(({ action }) => action !== "delete")
        .map(({ source: relative }) => [
          relative,
          fs.readFileSync(safePath(source, relative)),
        ]),
    );
    plan = expectedPlan(options);
    const entries = preimages(
      repository,
      [
        ...new Set([
          ...plan.operations.map(({ destination }) => destination),
          ...PROVENANCE_PATHS,
        ]),
      ].sort(),
    );
    const directory = path.join(transaction.root, "transaction");
    fs.mkdirSync(directory);
    for (const entry of entries) {
      if (!entry.exists) continue;
      const backup = safePath(directory, `preimages/${entry.path}`);
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.copyFileSync(safePath(repository, entry.path), backup);
    }
    atomicWrite(
      path.join(directory, "journal.json"),
      JSON.stringify({ $schema: JOURNAL_SCHEMA, planId: plan.planId, entries }),
    );
    for (const operation of plan.operations) {
      const target = safePath(repository, operation.destination);
      if (operation.action === "delete") fs.rmSync(target, { force: true });
      else {
        const state = record(source, operation.source);
        atomicWrite(
          target,
          frozen.get(operation.source),
          state.executable ? 0o755 : 0o644,
        );
      }
    }
    options.afterWrites?.();
    if (options.injectFailureAfterWrites)
      throw new Error("Injected reconciliation failure.");
    writeProvenance(repository);
    verifyProvenance(repository);
    fs.rmSync(directory, { recursive: true });
    return {
      ok: true,
      verified: true,
      planId: plan.planId,
      counts: plan.counts,
    };
  } catch (error) {
    try {
      recover(repository, transaction.root);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        "Reconciliation failed and recovery evidence was preserved.",
      );
    }
    throw error;
  } finally {
    release(transaction);
  }
}
