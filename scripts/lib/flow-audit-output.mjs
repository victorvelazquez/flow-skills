import { createHash } from "node:crypto";

export const FLOW_AUDIT_CHECKS_ONLY_MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_CHECKS = 7;
const MAX_KEY_LINES = 5;
const MAX_KEY_LINE_LENGTH = 240;
const MAX_COMMAND_LENGTH = 512;

function hash(value) {
  return createHash("sha256").update(value || "").digest("hex");
}

function truncate(value, limit) {
  const text = String(value || "");
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

export function compactAutomatedResults(automated) {
  return {
    overallStatus: automated.overallStatus,
    summary: truncate(automated.summary, MAX_COMMAND_LENGTH),
    details: (automated.details || []).slice(0, MAX_CHECKS).map((detail) => ({
      tool: truncate(detail.tool, MAX_COMMAND_LENGTH),
      command: detail.command ? truncate(detail.command, MAX_COMMAND_LENGTH) : null,
      status: detail.status,
      exitCode: detail.exitCode,
      duration: detail.duration,
      stdoutHash: hash(detail.stdout),
      stderrHash: hash(detail.stderr),
      keyLines: (detail.keyLines || []).slice(0, MAX_KEY_LINES).map((line) => truncate(line, MAX_KEY_LINE_LENGTH)),
    })),
  };
}
