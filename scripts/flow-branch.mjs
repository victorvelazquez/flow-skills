#!/usr/bin/env node
/**
 * flow-branch.mjs — Branch listing / checkout / deletion helper
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto-list                            Fetch + classify branches → JSON
 *   --checkout --branch <name>             Checkout local/remote branch → JSON
 *   --delete --branch <name>               Delete local branch → JSON
 *   --delete --branch <name> --force       Force delete local branch → JSON
 */

import { runSafe, parseArgs } from "./lib/helpers.mjs";
import process from "process";

const PROTECTED_BRANCHES = new Set(["main", "master", "dev", "development"]);

function output(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function parseBranchLines(rawOutput) {
  return rawOutput
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const isCurrent = line.startsWith("*");
      const cleaned = isCurrent ? line.slice(1).trim() : line;
      const [name, relativeDate = "unknown"] = cleaned.split("|");
      return {
        name: name.trim(),
        relativeDate: relativeDate.trim(),
        isCurrent,
      };
    })
    .filter(
      (branch) =>
        branch.name &&
        !branch.name.includes("HEAD ->") &&
        branch.name !== "origin",
    );
}

function buildBranchInventory() {
  const fetchResult = runSafe("git fetch origin");
  const listResult = runSafe(
    'git branch -a --sort=-committerdate --format="%(refname:short)|%(committerdate:relative)"',
  );

  if (!listResult.ok) {
    throw new Error(`Could not list branches: ${listResult.output}`);
  }

  const parsed = parseBranchLines(listResult.output);
  const locals = new Map();
  const remotes = new Map();
  let currentBranch = null;

  for (const branch of parsed) {
    if (branch.isCurrent) currentBranch = branch.name;

    if (branch.name.startsWith("origin/")) {
      const remoteName = branch.name.replace(/^origin\//, "");
      if (!remotes.has(remoteName))
        remotes.set(remoteName, branch.relativeDate);
      continue;
    }

    if (!locals.has(branch.name)) locals.set(branch.name, branch.relativeDate);
  }

  const orderedNames = [];
  const pushUnique = (name) => {
    if (!name || orderedNames.includes(name)) return;
    orderedNames.push(name);
  };

  if (locals.has("development") || remotes.has("development"))
    pushUnique("development");
  parsed.forEach((branch) => {
    pushUnique(branch.name.replace(/^origin\//, ""));
  });

  const entries = orderedNames.map((name) => {
    const hasLocal = locals.has(name);
    const hasRemote = remotes.has(name);
    const type =
      hasLocal && hasRemote
        ? "local+remote"
        : hasLocal
          ? "local only"
          : "remote only";
    return {
      name,
      type,
      relativeDate: locals.get(name) || remotes.get(name) || "unknown",
      isCurrent: currentBranch === name,
      protected: PROTECTED_BRANCHES.has(name),
    };
  });

  const grouped = {
    "local+remote": entries
      .filter((entry) => entry.type === "local+remote")
      .slice(0, 10),
    "local only": entries
      .filter((entry) => entry.type === "local only")
      .slice(0, 10),
    "remote only": entries
      .filter((entry) => entry.type === "remote only")
      .slice(0, 10),
  };

  const finalEntries = [
    ...grouped["local+remote"],
    ...grouped["local only"],
    ...grouped["remote only"],
  ]
    .slice(0, 30)
    .map((entry, index) => ({ ...entry, index: index + 1 }));

  return {
    success: true,
    fetched: fetchResult.ok,
    fetchOutput: fetchResult.output,
    currentBranch,
    branches: finalEntries,
    hint: "Para eliminar una rama local usa --delete --branch <name>.",
  };
}

function autoList() {
  const inventory = buildBranchInventory();
  output({
    ...inventory,
    mode: "auto-list",
    dryRun: false,
    nextAction: "select-branch",
  });
}

function checkoutBranch(flags) {
  const branch = flags["branch"];
  if (!branch || branch === true) {
    process.stderr.write("Error: --checkout requires --branch <name>\n");
    process.exit(1);
  }

  const inventory = buildBranchInventory();
  const entry = inventory.branches.find((item) => item.name === branch);
  if (!entry) {
    process.stderr.write(`Branch '${branch}' not found in inventory\n`);
    process.exit(1);
  }

  let checkoutResult;
  let updateCheck = null;
  let pullResult = null;

  if (entry.type === "remote only") {
    checkoutResult = runSafe(`git checkout --track origin/${branch}`);
  } else {
    checkoutResult = runSafe(`git checkout ${branch}`);
  }

  if (!checkoutResult.ok) {
    process.stderr.write(`Checkout failed: ${checkoutResult.output}\n`);
    process.exit(1);
  }

  if (entry.type === "local+remote") {
    updateCheck = runSafe(`git rev-list HEAD..origin/${branch} --count`);
  }

  output({
    success: true,
    mode: "checkout",
    dryRun: false,
    branch,
    type: entry.type,
    checkout: checkoutResult.output,
    updateCount:
      updateCheck && updateCheck.ok
        ? Number.parseInt(updateCheck.output, 10) || 0
        : null,
    pullResult,
    nextAction:
      updateCheck &&
      updateCheck.ok &&
      (Number.parseInt(updateCheck.output, 10) || 0) > 0
        ? "ask-pull"
        : "done",
  });
}

function deleteBranch(flags) {
  const branch = flags["branch"];
  const force = Boolean(flags["force"]);

  if (!branch || branch === true) {
    process.stderr.write("Error: --delete requires --branch <name>\n");
    process.exit(1);
  }

  const inventory = buildBranchInventory();
  const entry = inventory.branches.find((item) => item.name === branch);
  if (!entry) {
    process.stderr.write(`Branch '${branch}' not found in inventory\n`);
    process.exit(1);
  }

  if (entry.type === "remote only") {
    process.stderr.write("Only local branches can be deleted\n");
    process.exit(1);
  }

  if (entry.protected) {
    process.stderr.write(
      `Branch '${branch}' is protected and cannot be deleted\n`,
    );
    process.exit(1);
  }

  if (entry.isCurrent) {
    process.stderr.write("Cannot delete the currently checked out branch\n");
    process.exit(1);
  }

  const command = force ? `git branch -D ${branch}` : `git branch -d ${branch}`;
  const result = runSafe(command);

  output({
    success: result.ok,
    mode: "delete",
    dryRun: false,
    branch,
    force,
    output: result.output,
    error: result.ok ? null : result.output,
    nextAction: result.ok ? "done" : force ? "error" : "ask-force-delete",
  });

  if (!result.ok) {
    process.exit(1);
  }
}

function printHelp() {
  process.stderr.write(
    [
      "flow-branch.mjs — Branch listing / checkout / deletion helper",
      "",
      "Usage:",
      "  node flow-branch.mjs --auto-list",
      "  node flow-branch.mjs --checkout --branch <name>",
      "  node flow-branch.mjs --delete --branch <name> [--force]",
    ].join("\n") + "\n",
  );
}

const flags = parseArgs();

try {
  if (flags["auto-list"]) {
    autoList();
  } else if (flags["checkout"]) {
    checkoutBranch(flags);
  } else if (flags["delete"]) {
    deleteBranch(flags);
  } else {
    printHelp();
    process.exit(1);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
