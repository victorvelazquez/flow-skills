#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyRestore, buildRestorePlan, inspectRestoreTransaction } from "./tools/flow-assets.mjs";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));

const HELP = `Usage:
  node install.mjs [--dry-run] [--destination <path>]
  node install.mjs --apply --expected-target-commit <sha> --expected-plan-id <id> [--destination <path>]
  node install.mjs --help

Preview is the default. Copy the applyCommand from a ready preview to install that exact plan.
Use /flow-skills-sync for status, snapshots, and historical restores.`;

function parseArgs(args) {
  const legacy = {
    "--export": "Use /flow-skills-sync snapshot to mirror live Flow assets into the repository.",
    "--uninstall": "Uninstall is no longer provided; manage Flow assets explicitly in your OpenCode directory.",
    "--update": "Pull the repository explicitly, then preview this bootstrap again.",
    "--ref": "Historical targets are not supported here; use /flow-skills-sync restore <ref>.",
  };
  for (const argument of args) if (legacy[argument]) throw new Error(`${argument} is no longer supported. ${legacy[argument]}`);

  const flags = new Set(["--apply", "--dry-run", "--help"]);
  const values = new Set(["--destination", "--expected-target-commit", "--expected-plan-id"]);
  const parsed = { apply: false, dryRun: false, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    seen.add(argument);
    if (flags.has(argument)) {
      parsed[argument.slice(2).replace("dry-run", "dryRun")] = true;
      continue;
    }
    if (!values.has(argument)) throw new Error(`Unsupported argument: ${argument}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`Missing value for ${argument}.`);
    parsed[argument.slice(2).replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = args[++index];
  }
  if (parsed.help && args.length !== 1) throw new Error("--help does not accept other arguments.");
  if (parsed.apply && parsed.dryRun) throw new Error("--apply conflicts with --dry-run; preview and apply are separate operations.");
  if (!parsed.apply && (parsed.expectedTargetCommit || parsed.expectedPlanId)) throw new Error("Expected IDs are accepted only with --apply.");
  if (parsed.apply && (!parsed.expectedTargetCommit || !parsed.expectedPlanId)) {
    throw new Error("--apply requires both --expected-target-commit and --expected-plan-id from the accepted preview.");
  }
  return parsed;
}

function destinationFor(parsed) {
  return path.resolve(parsed.destination || process.env.FLOW_SKILLS_OPENCODE_DIR || path.join(os.homedir(), ".config", "opencode"));
}

function preview(destinationRoot) {
  if (!fs.existsSync(destinationRoot) || !fs.statSync(destinationRoot).isDirectory()) {
    throw new Error(`OpenCode destination directory does not exist: ${destinationRoot}`);
  }
  if (inspectRestoreTransaction(destinationRoot).incomplete) {
    throw new Error("An incomplete Flow restore transaction blocks preview. Recover it with /flow-skills-sync restore before retrying.");
  }
  const plan = buildRestorePlan({ requestedRef: "HEAD", destinationRoot, repoRoot: REPO_ROOT, recover: false });
  const applyCommand = `node ${JSON.stringify(path.join(REPO_ROOT, "install.mjs"))} --apply --expected-target-commit ${plan.target.commit} --expected-plan-id ${plan.planId} --destination ${JSON.stringify(destinationRoot)}`;
  return {
    mode: "preview",
    destination: destinationRoot,
    target: { commit: plan.target.commit, tree: plan.target.tree },
    planId: plan.planId,
    counts: plan.counts,
    totals: plan.target.totals,
    applySupported: plan.applySupported,
    applyCommand,
    stateChanged: false,
  };
}

function apply(parsed, destinationRoot) {
  const result = applyRestore({
    requestedRef: "HEAD",
    destinationRoot,
    repoRoot: REPO_ROOT,
    expectedTargetCommit: parsed.expectedTargetCommit,
    expectedPlanId: parsed.expectedPlanId,
  });
  return {
    mode: "apply",
    destination: destinationRoot,
    target: { commit: result.targetCommit, tree: result.targetTree },
    planId: result.planId,
    backup: { id: result.backupId, path: result.backupPath },
    counts: result.counts,
    totals: result.totals,
    verified: result.verified,
    configChanged: false,
    gitChanged: false,
    restartRequired: true,
    guidance: "Restart OpenCode to load the installed Flow generation. Use /flow-skills-sync for ongoing status, snapshots, and restores.",
  };
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) console.log(HELP);
  else {
    const destinationRoot = destinationFor(parsed);
    console.log(JSON.stringify(parsed.apply ? apply(parsed, destinationRoot) : preview(destinationRoot), null, 2));
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
