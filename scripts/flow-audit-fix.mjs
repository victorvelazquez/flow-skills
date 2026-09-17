#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const schema = "flow-audit-fix/v1";

function report(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function configuredFixes() {
  let packageJson;
  try {
    packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    );
  } catch {
    return [];
  }
  const scripts = packageJson.scripts || {};
  const candidates = [
    ["lint", scripts["lint:fix"] || scripts["fix:lint"]],
    ["format", scripts.format || scripts.fmt || scripts["fix:format"]],
  ];
  return candidates
    .filter(([, command]) => typeof command === "string" && command.trim())
    .map(([step, command]) => ({ step, command }));
}

function parse(argv) {
  if (argv.length === 1 && argv[0] === "preview")
    return { operation: "preview" };
  if (
    argv.length === 3 &&
    argv[0] === "execute" &&
    argv[1] === "--host-approval" &&
    argv[2] === "approved"
  )
    return { operation: "execute", approved: true };
  if (argv.length === 1 && argv[0] === "execute")
    return { operation: "execute", approved: false };
  return null;
}

const input = parse(process.argv.slice(2));
if (input) {
  const fixes = configuredFixes();
  if (input.operation === "preview") {
    report({
      schema,
      ok: true,
      operation: "preview",
      mutation: "requires-host-native-approval",
      fixes,
    });
  } else if (input.approved) {
    const results = fixes.map(({ step, command }) => {
      try {
        execSync(command, {
          cwd: process.cwd(),
          encoding: "utf8",
          stdio: "pipe",
        });
        return { step, command, status: "passed" };
      } catch (error) {
        return {
          step,
          command,
          status: "failed",
          output: String(error.stderr || error.stdout || error.message).trim(),
        };
      }
    });
    const failed = results.some(({ status }) => status === "failed");
    report(
      {
        schema,
        ok: !failed,
        operation: "execute",
        results,
      },
      failed ? 1 : 0,
    );
  } else {
    report(
      { schema, ok: false, operation: "execute", reason: "approval-required" },
      1,
    );
  }
} else {
  report({ schema, ok: false, reason: "invalid-arguments" }, 1);
}
