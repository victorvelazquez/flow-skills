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

if (args.length === 0 || !["--status", "--snapshot"].includes(args[0])) {
  fail("Usage: flow-skills.mjs --status | --snapshot --dry-run | --snapshot --apply --expected-plan-id <id> ...metadata");
}

for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (flagOptions.has(argument)) continue;
  if (!valueOptions.has(argument)) fail(`Unsupported argument: ${argument}`);
  if (index + 1 >= args.length || args[index + 1].startsWith("--")) {
    fail(`Missing value for ${argument}.`);
  }
  index += 1;
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

const forwarded = [args[0], "--source", sourceRoot, ...args.slice(1)];
const result = spawnSync(process.execPath, [engine, ...forwarded], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["inherit", "pipe", "pipe"],
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) fail(result.error.message);
process.exit(result.status ?? 1);
