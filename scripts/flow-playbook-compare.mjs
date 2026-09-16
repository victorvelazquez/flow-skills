#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const schema = "flow-playbook-compare/v1";

function report(value, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = exitCode;
}

function invalid(source, reason) {
  report(
    {
      schema,
      ok: false,
      availability: "invalid",
      source,
      reason,
      candidates: [],
    },
    1,
  );
}

function cliPath(args) {
  const index = args.indexOf("--playbook-path");
  if (index < 0) return null;
  const value = args[index + 1];
  return {
    source: "cli",
    value: value && !value.startsWith("--") ? value : null,
  };
}

function configuredPath(cwd) {
  const cli = cliPath(process.argv.slice(2));
  if (cli) return cli;
  const config = path.join(cwd, ".flow", "playbook.json");
  if (fs.existsSync(config)) {
    try {
      const value = JSON.parse(fs.readFileSync(config, "utf8")).playbookPath;
      return { source: "file", value };
    } catch {
      return { source: "file", value: null };
    }
  }
  if (Object.hasOwn(process.env, "FLOW_PLAYBOOK_PATH"))
    return { source: "environment", value: process.env.FLOW_PLAYBOOK_PATH };
  return null;
}

function candidates(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort()
    .map((entry) => ({
      path: entry,
      kind: "playbook-document",
      advisory: true,
    }));
}

const cwd = process.cwd();
const configured = configuredPath(cwd);

if (!configured) {
  report({
    schema,
    ok: true,
    availability: "unavailable",
    source: null,
    candidates: [],
  });
} else if (typeof configured.value !== "string" || !configured.value.trim()) {
  invalid(configured.source, "playbook-path-invalid");
} else {
  const playbookPath = path.resolve(cwd, configured.value);
  if (!fs.existsSync(playbookPath) || !fs.statSync(playbookPath).isDirectory())
    invalid(configured.source, "playbook-path-not-directory");
  else
    report({
      schema,
      ok: true,
      availability: "available",
      source: configured.source,
      playbookPath,
      candidates: candidates(playbookPath),
    });
}
