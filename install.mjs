#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyOpenCodeDeploy,
  buildOpenCodeDeployPlan,
} from "./tools/lib/managed-deployment.mjs";

const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PI_GUIDANCE =
  "Pi package resources are host-owned; run `pi install <package-source>` instead of install.mjs.";

const HELP = `Usage:
  node install.mjs [--dry-run] [--host opencode] [--destination <path>]
  node install.mjs --apply --expected-target-commit <sha> --expected-plan-id <id> [--host opencode] [--destination <path>]
  node install.mjs --help

Host: opencode (this one-release compatibility adapter supports OpenCode only).
Preview is the default. Copy the applyCommand from a ready preview to apply that exact plan.
Pi users: ${PI_GUIDANCE}`;

function parseArgs(args) {
  const legacy = {
    "--export":
      "Use /flow-skills-sync snapshot to mirror live Flow assets into the repository.",
    "--uninstall":
      "Uninstall is no longer provided; manage Flow assets explicitly in your OpenCode directory.",
    "--update":
      "Pull the repository explicitly, then preview this bootstrap again.",
    "--ref":
      "Historical targets are not supported here; use /flow-skills-sync restore <ref>.",
  };
  for (const argument of args)
    if (legacy[argument])
      throw new Error(
        `${argument} is no longer supported. ${legacy[argument]}`,
      );

  const flags = new Set(["--apply", "--dry-run", "--help"]);
  const values = new Set([
    "--destination",
    "--expected-target-commit",
    "--expected-plan-id",
    "--host",
  ]);
  const parsed = { apply: false, dryRun: false, help: false, host: "opencode" };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (seen.has(argument)) throw new Error(`Duplicate argument: ${argument}`);
    seen.add(argument);
    if (flags.has(argument)) {
      parsed[argument.slice(2).replace("dry-run", "dryRun")] = true;
      continue;
    }
    if (!values.has(argument))
      throw new Error(`Unsupported argument: ${argument}`);
    if (index + 1 >= args.length || args[index + 1].startsWith("--"))
      throw new Error(`Missing value for ${argument}.`);
    parsed[
      argument
        .slice(2)
        .replaceAll(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    ] = args[++index];
  }
  if (parsed.host === "pi") throw new Error(PI_GUIDANCE);
  if (parsed.host !== "opencode")
    throw new Error(
      "install.mjs only supports --host opencode. " + PI_GUIDANCE,
    );
  if (parsed.help && args.length !== 1)
    throw new Error("--help does not accept other arguments.");
  if (parsed.apply && parsed.dryRun)
    throw new Error(
      "--apply conflicts with --dry-run; preview and apply are separate operations.",
    );
  if (!parsed.apply && (parsed.expectedTargetCommit || parsed.expectedPlanId))
    throw new Error("Expected IDs are accepted only with --apply.");
  if (parsed.apply && (!parsed.expectedTargetCommit || !parsed.expectedPlanId))
    throw new Error(
      "--apply requires both --expected-target-commit and --expected-plan-id from the accepted preview.",
    );
  return parsed;
}

function destinationFor(parsed) {
  return path.resolve(
    parsed.destination ||
      process.env.FLOW_SKILLS_OPENCODE_DIR ||
      path.join(os.homedir(), ".config", "opencode"),
  );
}

function preview(destinationRoot) {
  const plan = buildOpenCodeDeployPlan({
    requestedRef: "HEAD",
    destinationRoot,
    repoRoot: REPO_ROOT,
  });
  const applyCommand = `node ${JSON.stringify(path.join(REPO_ROOT, "install.mjs"))} --apply --host opencode --expected-target-commit ${plan.target.commit} --expected-plan-id ${plan.planId} --destination ${JSON.stringify(destinationRoot)}`;
  return {
    host: "opencode",
    mode: "preview",
    requestedRef: "HEAD",
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
  const result = applyOpenCodeDeploy({
    requestedRef: "HEAD",
    destinationRoot,
    repoRoot: REPO_ROOT,
    expectedTargetCommit: parsed.expectedTargetCommit,
    expectedPlanId: parsed.expectedPlanId,
  });
  return {
    host: "opencode",
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
    guidance:
      "Restart OpenCode to load the installed Flow generation. Pi package resources remain managed through pi install.",
  };
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) console.log(HELP);
  else {
    const destinationRoot = destinationFor(parsed);
    console.log(
      JSON.stringify(
        parsed.apply
          ? apply(parsed, destinationRoot)
          : preview(destinationRoot),
        null,
        2,
      ),
    );
  }
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
