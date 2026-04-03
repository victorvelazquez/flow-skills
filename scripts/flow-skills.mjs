#!/usr/bin/env node
/**
 * flow-skills.mjs — local sync helper for the flow-skills repository
 * Node.js ESM, zero external dependencies, cross-platform (Windows + Linux/macOS)
 *
 * Modes:
 *   --auto [--dry-run]  Resolve sync/update/install context in one entrypoint → JSON
 *   --context      Detect mode + gather local sync context → JSON
 *   --run-export   Run install.mjs --export, return exported file list → JSON
 *   --update       Run git pull + node install.mjs → JSON result
 */

import { run, runSafe, parseArgs, readJsonFile } from "./lib/helpers.mjs";
import path from "path";
import os from "os";
import process from "process";

// ─── Remote URL parsing ───────────────────────────────────────────────────────
// Handles:
//   SSH:   git@github.com:owner/repo.git
//   HTTPS: https://github.com/owner/repo.git  (or no .git suffix)

function parseRemoteUrl(remoteUrl) {
  if (!remoteUrl) return { owner: null, repo: null };
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = remoteUrl.match(/git@[^:]+:([^/]+)\/([^.]+)(?:\.git)?$/);
  if (sshMatch) return { owner: sshMatch[1], repo: sshMatch[2] };
  // HTTPS format: https://github.com/owner/repo.git
  const httpsMatch = remoteUrl.match(
    /https?:\/\/[^/]+\/([^/]+)\/([^.]+)(?:\.git)?$/,
  );
  if (httpsMatch) return { owner: httpsMatch[1], repo: httpsMatch[2] };
  return { owner: null, repo: null };
}

// ─── --context ────────────────────────────────────────────────────────────────

function getContext() {
  // Is this a git repo?
  const revParse = runSafe("git rev-parse --show-toplevel");
  if (!revParse.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          mode: "install",
          modeReason: "Not in a git repository",
          git: {
            branch: null,
            isOnMain: false,
            hasOrigin: false,
            remoteUrl: null,
            owner: null,
            repo: null,
            upstreamCommits: 0,
            aheadCommits: 0,
          },
          version: null,
          prUrl: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // Fetch to check upstream (network call — ignore failure)
  runSafe("git fetch origin");

  // Branch — handle detached HEAD (empty output)
  const branchResult = runSafe("git branch --show-current");
  const branch =
    branchResult.ok && branchResult.output ? branchResult.output : "detached";
  const isOnMain = branch === "main" || branch === "master";

  // Remote URL
  const remoteResult = runSafe("git remote get-url origin");
  const remoteUrl = remoteResult.ok ? remoteResult.output : null;
  const hasOrigin = remoteResult.ok && !!remoteResult.output;
  const { owner, repo } = parseRemoteUrl(remoteUrl);

  // Upstream vs local divergence
  const upstreamResult = runSafe("git log HEAD..origin/main --oneline");
  const upstreamLines =
    upstreamResult.ok && upstreamResult.output
      ? upstreamResult.output.split("\n").filter(Boolean)
      : [];
  const upstreamCommits = upstreamLines.length;

  const aheadResult = runSafe("git log origin/main..HEAD --oneline");
  const aheadCommits =
    aheadResult.ok && aheadResult.output
      ? aheadResult.output.split("\n").filter(Boolean).length
      : 0;

  // Mode detection — check for pending export changes via dry-run
  const installPath = path.join(process.cwd(), "install.mjs");
  const dryRunResult = runSafe(`node "${installPath}" --export --dry-run`);
  let hasPendingExport = false;
  if (dryRunResult.ok && dryRunResult.output) {
    // install.mjs dry-run summary: "  Dry-run complete — X of Y files would be exported."
    // Also check skill-level status lines like "skillname — N files would update"
    const dryOut = dryRunResult.output;
    const summaryMatch = dryOut.match(/(\d+) of \d+ files would be exported/i);
    if (summaryMatch) {
      hasPendingExport = parseInt(summaryMatch[1], 10) > 0;
    } else {
      // Fallback: check for "would update" lines (individual skill status)
      hasPendingExport =
        /would (update|export)/i.test(dryOut) &&
        !/0 of \d+ files/i.test(dryOut);
    }
  }

  // Mode priority: install < synced < update < publish
  let mode = "synced";
  let modeReason = "Local opencode and flow-skills repo are in sync";

  if (hasPendingExport) {
    mode = "publish";
    modeReason = "Local opencode files have changes not yet exported to repo";
  } else if (upstreamCommits > 0 && aheadCommits === 0) {
    mode = "update";
    modeReason = `Remote has ${upstreamCommits} new commit(s) not yet pulled`;
  } else if (aheadCommits > 0) {
    mode = "publish";
    modeReason = `Local has ${aheadCommits} commit(s) not yet pushed to remote`;
  }

  const result = {
    mode,
    modeReason,
    git: {
      branch,
      isOnMain,
      hasOrigin,
      remoteUrl,
      owner,
      repo,
      upstreamCommits,
      aheadCommits,
    },
    sync: {
      pendingExport: hasPendingExport,
      exportDryRunDetected: hasPendingExport,
    },
  };

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── --run-export ─────────────────────────────────────────────────────────────
// WRITE OPERATION — has side effects (copies files from opencode → repo)
// Call EXACTLY ONCE per publish cycle. Use git diff --name-only for subsequent file list queries.

function runExport() {
  const installPath = path.join(process.cwd(), "install.mjs");
  const result = runSafe(`node "${installPath}" --export`);

  // install.mjs outputs "  exported: {relPath}" lines via plain console.log (no ANSI on the path)
  const exportedFiles = [];
  if (result.ok && result.output) {
    const lines = result.output.split("\n");
    for (const line of lines) {
      const match = line.match(/^  exported: (.+)$/);
      if (match) exportedFiles.push(match[1].trim());
    }
  }

  const output = {
    exported: exportedFiles.length > 0,
    files: exportedFiles,
    count: exportedFiles.length,
    nothing: exportedFiles.length === 0,
  };

  if (!result.ok) {
    output.exported = false;
    output.files = [];
    output.count = 0;
    output.nothing = true;
    output.error = result.output;
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

// ─── --update ─────────────────────────────────────────────────────────────────

function runUpdate() {
  // Verify git repo
  const revParse = runSafe("git rev-parse --show-toplevel");
  if (!revParse.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: false, output: "Not in a git repository" },
          install: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // git pull
  const pullResult = runSafe("git pull");
  if (!pullResult.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: false, output: pullResult.output },
          install: null,
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  // node install.mjs
  const installPath = path.join(process.cwd(), "install.mjs");
  const installResult = runSafe(`node "${installPath}"`);
  if (!installResult.ok) {
    process.stdout.write(
      JSON.stringify(
        {
          ok: false,
          pull: { ok: true, output: pullResult.output },
          install: { ok: false, output: installResult.output },
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        pull: { ok: true, output: pullResult.output },
        install: { ok: true, output: installResult.output },
      },
      null,
      2,
    ) + "\n",
  );
}

function auto(flags) {
  const dryRun = flags["dry-run"] === true;
  const oldStdoutWrite = process.stdout.write;

  const captureJson = (fn) => {
    let captured = "";
    process.stdout.write = (chunk) => {
      captured += chunk;
      return true;
    };
    try {
      fn();
    } finally {
      process.stdout.write = oldStdoutWrite;
    }
    return JSON.parse(captured);
  };

  const context = captureJson(() => getContext());
  const result = {
    success: true,
    mode: "auto",
    dryRun,
    context,
    actionPlan: null,
    nextAction: "review-context",
  };

  if (context.mode === "publish") {
    if (dryRun) {
      result.actionPlan = {
        publish: true,
        export: "skipped-dry-run",
        next: "run-flow-commit-after-export",
      };
      result.nextAction = "review-local-sync-plan";
    } else {
      const exported = captureJson(() => runExport());
      result.export = exported;
      result.actionPlan = {
        publish: true,
        exportedFiles: exported.files,
        next: exported.nothing ? "noop" : "run-flow-commit-after-export",
      };
      result.nextAction = exported.nothing
        ? "noop"
        : "run-flow-commit-after-export";
    }
  } else if (context.mode === "update") {
    if (dryRun) {
      result.actionPlan = {
        update: true,
        pull: "skipped-dry-run",
        install: "skipped-dry-run",
      };
      result.nextAction = "review-update-plan";
    } else {
      result.update = captureJson(() => runUpdate());
      result.actionPlan = {
        update: true,
        ok: result.update.ok,
      };
      result.nextAction = result.update.ok ? "done" : "handle-update-error";
    }
  } else if (context.mode === "install") {
    result.actionPlan = {
      install: true,
      next: "manual-install-required",
    };
    result.nextAction = "manual-install-required";
  } else {
    result.actionPlan = { synced: true };
    result.nextAction = "noop";
  }

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const flags = parseArgs();

if (flags["context"]) {
  getContext();
} else if (flags["auto"]) {
  auto(flags);
} else if (flags["run-export"]) {
  runExport();
} else if (flags["update"]) {
  runUpdate();
} else {
  process.stderr.write(
    "Usage:\n" +
      "  node flow-skills.mjs --auto [--dry-run]\n" +
      "  node flow-skills.mjs --context\n" +
      "  node flow-skills.mjs --run-export\n" +
      "  node flow-skills.mjs --update\n\n" +
      "Notes:\n" +
      "  - publish mode only syncs local changes into the local flow-skills repo\n" +
      "  - to publish remotely, continue with /flow-commit and /flow-pr inside Tools/flow-skills\n",
  );
  process.exit(1);
}
