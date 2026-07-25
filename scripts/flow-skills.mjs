#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const valueOptions = new Set([
  "--expected-plan-id",
  "--captured-at",
  "--opencode-version",
  "--gentle-ai-version",
]);
const flagOptions = new Set(["--status", "--snapshot", "--dry-run", "--apply"]);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const restore = args[0] === "restore";
if (!restore && (args.length === 0 || !["--status", "--snapshot"].includes(args[0]))) {
  fail("Usage: flow-skills.mjs --status | --snapshot ... | restore <ref> [--apply --expected-target-commit <sha> --expected-plan-id <id>]");
}

if (restore) {
  if (!args[1] || args[1].startsWith("--")) fail("Restore requires a ref.");
  const restoreArgs = args.slice(2);
  const restoreValues = new Set(["--expected-target-commit", "--expected-plan-id"]);
  const seen = new Set();
  for (let index = 0; index < restoreArgs.length; index += 1) {
    const argument = restoreArgs[index];
    if (seen.has(argument)) fail(`Duplicate restore argument: ${argument}`);
    seen.add(argument);
    if (argument === "--apply") continue;
    if (!restoreValues.has(argument)) fail(`Unsupported restore argument: ${argument}`);
    if (!restoreArgs[index + 1] || restoreArgs[index + 1].startsWith("--")) fail(`Missing value for ${argument}.`);
    index += 1;
  }
  const applying = seen.has("--apply");
  if (!applying && restoreArgs.length > 0) fail("Restore preview does not accept apply authority IDs.");
  if (applying && [...restoreValues].some((name) => !seen.has(name))) fail("Restore apply requires expected target commit and plan ID.");
} else {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (flagOptions.has(argument)) continue;
    if (!valueOptions.has(argument)) fail(`Unsupported argument: ${argument}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) fail(`Missing value for ${argument}.`);
    index += 1;
  }
}

const repoRoot = path.resolve(
  process.env.FLOW_SKILLS_REPO || path.join(os.homedir(), "Developer", "Tools", "flow-skills"),
);
const sourceRoot = path.resolve(
  process.env.FLOW_SKILLS_OPENCODE_DIR || path.join(os.homedir(), ".config", "opencode"),
);
const engine = path.join(repoRoot, "tools", "flow-assets.mjs");

if (!fs.existsSync(engine) || !fs.statSync(engine).isFile()) {
  fail(`Flow skills repository not found or missing tools/flow-assets.mjs: ${repoRoot}`);
}
if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
  fail(`OpenCode source directory not found: ${sourceRoot}`);
}

const forwarded = restore
  ? ["--restore", "--ref", args[1], "--destination", sourceRoot, ...(args.includes("--apply") ? args.slice(2) : ["--dry-run"])]
  : [args[0], "--source", sourceRoot, ...args.slice(1)];
const result = spawnSync(process.execPath, [engine, ...forwarded], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
