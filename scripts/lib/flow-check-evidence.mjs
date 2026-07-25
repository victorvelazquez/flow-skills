import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const FLOW_CHECK_EVIDENCE_SCHEMA = "flow-check-evidence/v1";

export function digestChangedPaths(paths) {
  return crypto.createHash("sha256").update([...new Set(paths || [])].sort().join("\n")).digest("hex");
}

export function readAndValidateCheckEvidence(options) {
  const evidencePath = path.resolve(options.cwd, options.path);
  if (!fs.existsSync(evidencePath)) return { status: "Not recorded", details: [], evidence: null };
  let evidence;
  try { evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8")); }
  catch (error) { throw new Error(`Invalid check evidence '${evidencePath}': ${error.message}`); }
  if (evidence.schema !== FLOW_CHECK_EVIDENCE_SCHEMA) throw new Error(`Invalid check evidence schema: expected ${FLOW_CHECK_EVIDENCE_SCHEMA}.`);
  if (!Array.isArray(evidence.commands) || evidence.commands.length === 0) throw new Error("Invalid check evidence: commands must be a non-empty array.");
  for (const command of evidence.commands) {
    const startedAt = Date.parse(command.startedAt);
    const finishedAt = Date.parse(command.finishedAt);
    const relativeCwd = path.relative(path.resolve(options.cwd), path.resolve(command.cwd || ""));
    if (!Array.isArray(command.argv) || command.argv.some((arg) => typeof arg !== "string") || typeof command.cwd !== "string" || typeof command.startedAt !== "string" || typeof command.finishedAt !== "string" || !Number.isInteger(command.exitCode) || !["passed", "failed"].includes(command.status) || typeof command.summary !== "string" || typeof command.stdoutSha256 !== "string" || typeof command.stderrSha256 !== "string") throw new Error("Invalid check evidence: malformed command record.");
    if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt || relativeCwd.startsWith("..") || path.isAbsolute(relativeCwd) || !/^[a-f0-9]{64}$/i.test(command.stdoutSha256) || !/^[a-f0-9]{64}$/i.test(command.stderrSha256)) throw new Error("Invalid check evidence: command provenance is invalid.");
  }
  const staleReasons = [];
  const actual = evidence.identity || {};
  for (const key of ["repository", "base", "head", "tree", "mergeBase", "changedPathsDigest"]) if (actual[key] !== options.identity[key]) staleReasons.push(`${key} changed`);
  if (staleReasons.length > 0) return { status: "Stale", details: staleReasons, evidence };
  const failed = evidence.commands.filter((command) => command.exitCode !== 0 || command.status !== "passed");
  if (failed.length > 0) return { status: "Failed", details: failed.map((command) => command.summary), evidence };
  return { status: "Passed", details: evidence.commands.map((command) => command.summary), evidence };
}
