#!/usr/bin/env node
/**
 * flow-branch.mjs — Branch listing / checkout / deletion helper
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto-list                                   Fetch + classify branches → JSON
 *   <branch-or-alias>                             Resolve + checkout branch, pulling when applicable → JSON
 *   --checkout --branch <name> [--pull]           Checkout local/remote branch → JSON
 *   --delete --branch <name>                      Delete local branch → JSON
 *   --delete --branch <name> --force              Force delete local branch → JSON
 */

import { execFileSync } from "child_process";
import process from "process";

import { parseArgs, PROTECTED_BRANCHES as PROTECTED_BRANCH_NAMES } from "./lib/helpers.mjs";

const PROTECTED_BRANCHES = new Set(PROTECTED_BRANCH_NAMES);
const DEVELOPMENT_FALLBACK = ["development", "develop", "dev"];

function output(obj) {
  process.stdout.write(JSON.stringify(obj, null, 2) + "\n");
}

function failJson(mode, error, extra = {}, nextAction = "error") {
  output({
    success: false,
    mode,
    dryRun: false,
    ...extra,
    error,
    nextAction,
  });
  process.exit(1);
}

function runGitSafe(args) {
  try {
    return {
      ok: true,
      output: execFileSync("git", args, {
        encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      cwd: process.cwd(),
      env: { ...process.env, LANG: "C", LC_ALL: "C" },
      }).trimEnd(),
    };
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : "";
    return { ok: false, output: stderr || err.message || String(err) };
  }
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

function buildBranchInventory({ requireFetch = false } = {}) {
  const fetchResult = runGitSafe(["fetch", "origin"]);
  if (requireFetch && !fetchResult.ok) {
    throw new Error(`Fetch from origin failed: ${fetchResult.output}`);
  }
  const listResult = runGitSafe([
    "branch",
    "-a",
    "--sort=-committerdate",
    "--format=%(refname:short)|%(committerdate:relative)",
  ]);
  const currentResult = runGitSafe(["branch", "--show-current"]);

  if (!listResult.ok) {
    throw new Error(`Could not list branches: ${listResult.output}`);
  }

  const parsed = parseBranchLines(listResult.output);
  const locals = new Map();
  const remotes = new Map();
  const currentBranch = currentResult.ok ? currentResult.output.trim() || null : null;

  for (const branch of parsed) {
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

  const allEntries = entries.map((entry, index) => ({ ...entry, index: index + 1 }));

  return {
    fetched: fetchResult.ok,
    currentBranch,
    branches: finalEntries,
    allBranches: allEntries,
  };
}

function buildDisplayTable(branches) {
  const lines = [];
  let lastType = null;

  for (const b of branches) {
    if (b.type !== lastType) {
      if (lastType !== null) lines.push("");
      lines.push(`**${b.type}**`);
      lastType = b.type;
    }
    const current = b.isCurrent ? " ◀" : "";
    const prot = b.protected ? " 🔒" : "";
    lines.push(`  ${b.index}. ${b.name}  (${b.relativeDate})${current}${prot}`);
  }

  return lines.join("\n");
}

function buildInteractionInstructions() {
  return [
    "Ingresá solo un número para cambiar a esa rama y hacer pull/update del remoto si corresponde.",
    "Ingresá números seguidos de `eliminar` para borrar ramas locales, por ejemplo: `2 eliminar`, `2-7 eliminar`, `3,5 eliminar`.",
  ].join("\n");
}

function resolveDirectBranch(branchOrAlias, branches) {
  if (!branchOrAlias || branchOrAlias.startsWith("-")) {
    return { status: "none", matches: [] };
  }

  if (branchOrAlias === "dev" || branchOrAlias === "develop") {
    const match = DEVELOPMENT_FALLBACK
      .map((name) => branches.find((branch) => branch.name === name))
      .find(Boolean);
    return match ? { status: "resolved", branch: match, matches: [match] } : { status: "none", matches: [] };
  }

  if (["development", "main", "master"].includes(branchOrAlias)) {
    const match = branches.find((branch) => branch.name === branchOrAlias);
    return match ? { status: "resolved", branch: match, matches: [match] } : { status: "none", matches: [] };
  }

  const exactMatch = branches.find((branch) => branch.name === branchOrAlias);
  if (exactMatch) {
    return { status: "resolved", branch: exactMatch, matches: [exactMatch] };
  }

  const prefixMatches = branches.filter((branch) => branch.name.startsWith(branchOrAlias));
  if (prefixMatches.length === 1) {
    return { status: "resolved", branch: prefixMatches[0], matches: prefixMatches };
  }

  return {
    status: prefixMatches.length > 1 ? "ambiguous" : "none",
    matches: prefixMatches,
  };
}

function autoList() {
  const inventory = buildBranchInventory();
  output({
    success: true,
    mode: "auto-list",
    dryRun: false,
    currentBranch: inventory.currentBranch,
    branches: inventory.branches,
    allBranches: inventory.allBranches,
    display: buildDisplayTable(inventory.branches),
    instructions: buildInteractionInstructions(),
    nextAction: "select-branch",
  });
}

function checkoutBranch(flags, options = {}) {
  const branch = flags["branch"];
  const autoPull = Boolean(flags["pull"]);
  const mode = options.mode || "checkout";

  if (!branch || branch === true) {
    failJson(mode, "Error: --checkout requires --branch <name>");
  }

  const inventory = options.inventory || buildBranchInventory();
  const entry = inventory.allBranches.find((item) => item.name === branch);
  if (!entry) {
    failJson(mode, `Branch '${branch}' not found in inventory`, { branch });
  }

  let checkoutResult;

  if (entry.type === "remote only") {
    checkoutResult = runGitSafe(["checkout", "--track", `origin/${branch}`]);
  } else {
    checkoutResult = runGitSafe(["checkout", branch]);
  }

  if (!checkoutResult.ok) {
    failJson(mode, `Checkout failed: ${checkoutResult.output}`, {
      branch,
      type: entry.type,
    });
  }

  let updateCount = null;
  let pullResult = null;
  let nextAction = "done";

  if (entry.type === "local+remote") {
    const updateCheck = runGitSafe(["rev-list", `HEAD..origin/${branch}`, "--count"]);
    if (updateCheck.ok) {
      updateCount = Number.parseInt(updateCheck.output, 10) || 0;

      if (updateCount > 0) {
        if (autoPull) {
          pullResult = runGitSafe(["pull"]);
          nextAction = pullResult.ok ? "done" : "pull-error";
        } else {
          nextAction = "ask-pull";
        }
      }
    }
  }

  output({
    success: true,
    mode,
    dryRun: false,
    requestedBranch: options.requestedBranch || branch,
    branch,
    type: entry.type,
    updateCount,
    pulled: autoPull && pullResult !== null,
    pullSuccess: pullResult ? pullResult.ok : null,
    error: pullResult && !pullResult.ok ? pullResult.output : null,
    nextAction,
  });
}

function deleteBranch(flags) {
  const branch = flags["branch"];
  const force = Boolean(flags["force"]);

  if (!branch || branch === true) {
    failJson("delete", "Error: --delete requires --branch <name>");
  }

  const inventory = buildBranchInventory();
  const entry = inventory.allBranches.find((item) => item.name === branch);
  if (!entry) {
    failJson("delete", `Branch '${branch}' not found in inventory`, { branch });
  }

  if (entry.protected) {
    failJson("delete", `Branch '${branch}' is protected and cannot be deleted`, {
      branch,
      type: entry.type,
    });
  }

  if (entry.type === "remote only") {
    failJson("delete", "Only local branches can be deleted", {
      branch,
      type: entry.type,
    });
  }

  if (entry.isCurrent) {
    failJson("delete", "Cannot delete the currently checked out branch", {
      branch,
      type: entry.type,
    });
  }

  const result = runGitSafe(["branch", force ? "-D" : "-d", "--", branch]);
  const unmerged = !force && /not fully merged|not yet merged/i.test(result.output);

  output({
    success: result.ok,
    mode: "delete",
    dryRun: false,
    branch,
    force,
    error: result.ok ? null : result.output,
    nextAction: result.ok ? "done" : unmerged ? "ask-force-delete" : "error",
  });

  if (!result.ok) {
    process.exit(1);
  }
}

function showDirectOptions(branchOrAlias, resolution, inventory) {
  const optionBranches = resolution.matches.length > 0
    ? resolution.matches.map((match, index) => ({ ...match, index: index + 1 }))
    : inventory.branches;

  output({
    success: false,
    mode: "direct",
    dryRun: false,
    requestedBranch: branchOrAlias,
    currentBranch: inventory.currentBranch,
    branches: optionBranches,
    display: buildDisplayTable(optionBranches),
    instructions: buildInteractionInstructions(),
    error: resolution.status === "ambiguous"
      ? `Branch '${branchOrAlias}' is ambiguous: ${resolution.matches.map((match) => match.name).join(", ")}`
      : `Branch '${branchOrAlias}' was not found`,
    nextAction: resolution.status === "ambiguous" ? "select-branch" : "error",
  });
  process.exitCode = 1;
}

function directRelation(branch) {
  const result = runGitSafe(["rev-list", "--left-right", "--count", `${branch}...origin/${branch}`]);
  if (!result.ok) throw new Error(`Could not compare '${branch}' with origin: ${result.output}`);
  const [ahead, behind] = result.output.trim().split(/\s+/).map((value) => Number.parseInt(value, 10));
  if (!Number.isSafeInteger(ahead) || !Number.isSafeInteger(behind)) {
    throw new Error(`Could not parse branch relation for '${branch}'`);
  }
  return { ahead, behind };
}

function directCheckoutError(branch, outputText) {
  if (/already checked out at|used by worktree|is checked out at/i.test(outputText)) {
    return `Branch '${branch}' is checked out in another worktree: ${outputText}`;
  }
  return `Checkout failed: ${outputText}`;
}

function checkoutDirectBranch(branchOrAlias) {
  const status = runGitSafe(["status", "--porcelain=v1", "--untracked-files=normal"]);
  if (!status.ok) failJson("direct", `Could not inspect worktree: ${status.output}`, { requestedBranch: branchOrAlias });
  if (status.output) {
    failJson("direct", "Direct branch switching requires a clean worktree; no changes were discarded", {
      requestedBranch: branchOrAlias,
      dirty: true,
    });
  }

  const inventory = buildBranchInventory({ requireFetch: true });
  const resolution = resolveDirectBranch(branchOrAlias, inventory.allBranches);

  if (resolution.status !== "resolved") {
    showDirectOptions(branchOrAlias, resolution, inventory);
    return;
  }

  const entry = resolution.branch;
  const branch = entry.name;
  const relation = entry.type === "local+remote" ? directRelation(branch) : { ahead: null, behind: null };
  if (relation.ahead > 0 && relation.behind > 0) {
    failJson("direct", `Branch '${branch}' has diverged from origin/${branch}; refusing a non-fast-forward update`, {
      requestedBranch: branchOrAlias,
      branch,
      ...relation,
    });
  }

  const checkoutResult = entry.type === "remote only"
    ? runGitSafe(["checkout", "--track", `origin/${branch}`])
    : runGitSafe(["checkout", branch]);
  if (!checkoutResult.ok) {
    failJson("direct", directCheckoutError(branch, checkoutResult.output), {
      requestedBranch: branchOrAlias,
      branch,
      type: entry.type,
    });
  }

  let updated = false;
  if (entry.type === "local+remote" && relation.behind > 0) {
    const updateResult = runGitSafe(["merge", "--ff-only", `origin/${branch}`]);
    if (!updateResult.ok) {
      failJson("direct", `Fast-forward update from origin/${branch} failed: ${updateResult.output}`, {
        requestedBranch: branchOrAlias,
        branch,
        ...relation,
      }, "update-error");
    }
    updated = true;
  }

  output({
    success: true,
    mode: "direct",
    dryRun: false,
    requestedBranch: branchOrAlias,
    branch,
    type: entry.type,
    fetched: true,
    ahead: relation.ahead,
    behind: relation.behind,
    updated,
    updateStrategy: entry.type === "local+remote" ? "ff-only" : entry.type === "remote only" ? "tracking-checkout" : "none",
    nextAction: "done",
  });
}

function printHelp() {
  process.stderr.write(
    [
      "flow-branch.mjs — Branch listing / checkout / deletion helper",
      "",
      "Usage:",
      "  node flow-branch.mjs --auto-list",
      "  node flow-branch.mjs <branch-or-alias>",
      "  node flow-branch.mjs --checkout --branch <name> [--pull]",
      "  node flow-branch.mjs --delete --branch <name> [--force]",
    ].join("\n") + "\n",
  );
}

const rawArgs = process.argv.slice(2);
const flags = parseArgs();
const directBranchArg = rawArgs.length === 1 && !rawArgs[0].startsWith("--") ? rawArgs[0] : null;

try {
  if (flags["auto-list"]) {
    autoList();
  } else if (directBranchArg) {
    checkoutDirectBranch(directBranchArg);
  } else if (flags["checkout"]) {
    checkoutBranch(flags);
  } else if (flags["delete"]) {
    deleteBranch(flags);
  } else {
    printHelp();
    process.exit(1);
  }
} catch (error) {
  const mode = flags["auto-list"]
    ? "auto-list"
    : directBranchArg
      ? "direct"
      : flags["checkout"]
        ? "checkout"
        : flags["delete"]
          ? "delete"
          : "unknown";
  failJson(mode, error.message || String(error));
}
