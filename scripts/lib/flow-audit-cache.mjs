import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const FLOW_AUDIT_CACHE_SCHEMA = "flow-audit-delivery-evidence/v4";
export const FLOW_AUDIT_CACHE_TTL_MS = 30 * 60 * 1000;

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalPath(value) {
  const resolved = fs.realpathSync.native(value).replace(/\\/g, "/");
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function git(cwd, args, encoding = "utf8") {
  return execFileSync("git", args, {
    cwd,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 4 * 1024 * 1024,
  });
}

function gitText(cwd, args) {
  return git(cwd, args).trim();
}

function readUntrackedEntries(cwd) {
  return git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0").filter(Boolean).sort();
}

function hashUntrackedFiles(root, entries) {
  const digest = createHash("sha256");
  for (const entry of entries) {
    const filePath = path.resolve(root, entry);
    const relative = path.relative(root, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("untracked path escaped repository root");
    }
    const stat = fs.lstatSync(filePath);
    digest.update(entry, "utf8");
    digest.update("\0");
    digest.update(`mode:${stat.mode & 0o777}\0`, "utf8");
    if (stat.isSymbolicLink()) {
      digest.update("symlink\0", "utf8");
      digest.update(fs.readlinkSync(filePath), "utf8");
    } else if (stat.isFile()) {
      digest.update("file\0", "utf8");
      digest.update(fs.readFileSync(filePath));
    } else {
      throw new Error(`untracked path is not a regular file: ${entry}`);
    }
    digest.update("\0");
  }
  return digest.digest("hex");
}

function resolvePublicationBoundary(root, baseRef, candidateRef) {
  if (!baseRef && !candidateRef) return null;
  if (!baseRef || !candidateRef) {
    throw new Error("publication fingerprint requires both baseRef and candidateRef");
  }
  const publicationBaseCommit = gitText(root, ["rev-parse", "--verify", `${baseRef}^{commit}`]);
  const candidateCommit = gitText(root, ["rev-parse", "--verify", `${candidateRef}^{commit}`]);
  const mergeBase = gitText(root, ["merge-base", publicationBaseCommit, candidateCommit]);
  const publicationBaseTree = gitText(root, ["rev-parse", `${publicationBaseCommit}^{tree}`]);
  const candidateTree = gitText(root, ["rev-parse", `${candidateCommit}^{tree}`]);
  const changedPaths = git(root, ["diff", "--name-only", "--no-renames", publicationBaseCommit, candidateCommit, "--"])
    .split("\n").filter(Boolean).sort();
  return {
    baseRef,
    candidateRef,
    publicationBaseCommit,
    publicationBaseTree,
    mergeBase,
    candidateCommit,
    candidateTree,
    changedPaths,
    pathsDigest: hash(changedPaths.join("\0")),
  };
}

export function getCandidateFingerprint(cwd = process.cwd(), options = {}) {
  const root = gitText(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root) throw new Error("not inside a git worktree");
  const canonicalRoot = canonicalPath(root);
  const remote = (() => {
    try { return gitText(root, ["config", "--get", "remote.origin.url"]); }
    catch { return ""; }
  })();
  const publication = resolvePublicationBoundary(root, options.baseRef || null, options.candidateRef || null);
  const head = gitText(root, ["rev-parse", "HEAD"]);
  const staged = git(root, ["diff", "--binary", "--cached"], "buffer");
  const unstaged = git(root, ["diff", "--binary"], "buffer");
  const untracked = readUntrackedEntries(root);
  const untrackedHash = hashUntrackedFiles(root, untracked);
  const toolConfigDigest = options.toolConfigDigest || null;
  const repoIdentity = hash(JSON.stringify({ remote, root: canonicalRoot }));
  const fingerprint = hash(Buffer.concat([
    Buffer.from(`publication\0${JSON.stringify(publication)}\0tool-config\0${toolConfigDigest || ""}\0head\0${head}\0staged\0`),
    Buffer.from(staged),
    Buffer.from("\0unstaged\0"),
    Buffer.from(unstaged),
    Buffer.from(`\0untracked\0${untrackedHash}`),
  ]));
  return {
    root: canonicalRoot,
    remote,
    repoIdentity,
    fingerprint,
    untrackedCount: untracked.length,
    publication,
    toolConfigDigest,
  };
}

export function candidateChanged(before, after) {
  return !after || before.repoIdentity !== after.repoIdentity || before.fingerprint !== after.fingerprint;
}

export function getCachePath(repoIdentity, cacheRoot = process.env.FLOW_AUDIT_CACHE_DIR) {
  return path.join(cacheRoot || path.join(os.homedir(), ".flow", "cache", "audit-evidence-v1"), `${repoIdentity}.json`);
}

function normalizeChecks(details = []) {
  return details.map((detail) => {
    const normalized = {
      tool: detail.tool,
      command: detail.command || null,
      status: detail.status,
      exitCode: detail.exitCode,
      stdoutHash: hash(detail.stdout || ""),
      stderrHash: hash(detail.stderr || ""),
    };
    return { ...normalized, resultHash: hash(JSON.stringify(normalized)) };
  });
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function isBoundedText(value, allowNull = false) {
  return (allowNull && value === null) || (typeof value === "string" && value.length > 0 && value.length <= 512);
}

export function toolResultHashes(details = []) {
  return normalizeChecks(details).map((detail) => ({
    tool: detail.tool,
    status: detail.status,
    exitCode: detail.exitCode,
    hash: detail.resultHash,
  }));
}

function isValidPassCache(cached, candidate, now) {
  const createdAt = Date.parse(cached?.timestamp);
  if (
    cached?.schema !== FLOW_AUDIT_CACHE_SCHEMA ||
    cached.root !== candidate.root ||
    cached.remote !== candidate.remote ||
    cached.repoIdentity !== candidate.repoIdentity ||
    cached.fingerprint !== candidate.fingerprint ||
    cached.toolConfigDigest !== candidate.toolConfigDigest ||
    JSON.stringify(cached.publication || null) !== JSON.stringify(candidate.publication || null) ||
    cached.status !== "PASS" ||
    !Array.isArray(cached.checks) ||
    !Array.isArray(cached.toolResultHashes) ||
    cached.checks.length === 0 ||
    cached.checks.length > 7 ||
    cached.checks.length !== cached.toolResultHashes.length ||
    !Number.isFinite(createdAt) || now - createdAt < 0 || now - createdAt > FLOW_AUDIT_CACHE_TTL_MS
  ) return false;
  let passed = 0;
  return cached.checks.every((check, index) => {
    const claimed = cached.toolResultHashes[index];
    const normalized = {
      tool: check?.tool,
      command: check?.command || null,
      status: check?.status,
      exitCode: check?.exitCode,
      stdoutHash: check?.stdoutHash,
      stderrHash: check?.stderrHash,
    };
    const validStatus = normalized.status === "passed" || normalized.status === "skipped";
    const validExitCode = normalized.status === "passed" ? normalized.exitCode === 0 : normalized.exitCode === null;
    if (normalized.status === "passed") passed += 1;
    return validStatus && validExitCode && isBoundedText(normalized.tool) &&
      isBoundedText(normalized.command, true) && isSha256(normalized.stdoutHash) &&
      isSha256(normalized.stderrHash) && isSha256(check.resultHash) &&
      check.resultHash === hash(JSON.stringify(normalized)) && claimed?.tool === normalized.tool &&
      claimed?.status === normalized.status && claimed?.exitCode === normalized.exitCode &&
      claimed?.hash === check.resultHash && isSha256(claimed?.hash);
  }) && passed > 0;
}

export function readPassCache(candidate, now = Date.now()) {
  try {
    const cached = JSON.parse(fs.readFileSync(getCachePath(candidate.repoIdentity), "utf8"));
    return isValidPassCache(cached, candidate, now) ? cached : null;
  } catch { return null; }
}

export function writePassCache(candidate, automated) {
  if (automated?.overallStatus !== "PASS" || !automated.details?.some((detail) => detail.status === "passed" && detail.exitCode === 0)) return null;
  const cachePath = getCachePath(candidate.repoIdentity);
  const payload = {
    schema: FLOW_AUDIT_CACHE_SCHEMA,
    root: candidate.root,
    remote: candidate.remote,
    repoIdentity: candidate.repoIdentity,
    fingerprint: candidate.fingerprint,
    toolConfigDigest: candidate.toolConfigDigest,
    publication: candidate.publication || null,
    status: "PASS",
    checks: normalizeChecks(automated.details),
    timestamp: new Date().toISOString(),
    toolResultHashes: toolResultHashes(automated.details),
  };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, cachePath);
  return payload;
}
