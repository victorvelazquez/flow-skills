import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  appendDrafts,
  emptyBacklog,
  serializeBacklog,
} from "../core/flow-debt-backlog.mjs";
import { DRAFT_SCHEMA } from "../core/flow-debt-contract.mjs";
import {
  executeFlowDebtPreparation,
  prepareFlowDebtExecution,
  recoverFlowDebtPreparation,
} from "../scripts/lib/flow-debt-execution.mjs";

function repository() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "flow-debt-execution-"));
}

function repositoryId(root) {
  return createHash("sha256")
    .update(
      `flow-debt-cli/repository/v1\0${path.normalize(fs.realpathSync.native(root))}`,
    )
    .digest("hex");
}

function draft(title) {
  return {
    schema: DRAFT_SCHEMA,
    title,
    problem: "Public execution needs a bounded prepared transition.",
    priority: "p1",
    severity: "high",
    scope: ["scripts/flow-debt.mjs"],
    acceptanceCriteria: ["Mutate only a current preparation."],
    verification: ["node --test tests/flow-debt-execution.test.mjs"],
    producer: { kind: "test", reference: "execution" },
    evidence: [
      {
        reference: "test:execution",
        summary: "Expected transitions are observable.",
      },
    ],
  };
}

function writeBacklog(root, backlog) {
  const target = path.join(root, ".flow", "debt", "backlog.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, serializeBacklog(backlog));
}

function readBacklog(root) {
  return fs.readFileSync(
    path.join(root, ".flow", "debt", "backlog.json"),
    "utf8",
  );
}

test("execute applies a current preparation once and replay and recovery report already-applied", () => {
  const root = repository();
  const now = 1_000;
  const handle = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Execute once")] },
    now,
  });

  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now,
      approved: true,
    }),
    {
      status: "completed",
      operation: "create",
    },
  );
  const persisted = readBacklog(root);
  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now,
      approved: true,
    }),
    {
      status: "already-applied",
      operation: "create",
    },
  );
  assert.equal(readBacklog(root), persisted);
  assert.deepEqual(
    recoverFlowDebtPreparation({ repositoryRoot: root, handle, now }),
    {
      status: "already-applied",
      operation: "create",
    },
  );
});

test("approval is a caller-supplied host gate and a declined execution has no effect", () => {
  const root = repository();
  const now = 1_000;
  const handle = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Declined")] },
    now,
  });

  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now,
      approved: false,
    }),
    {
      status: "approval-required",
      operation: "create",
    },
  );
  assert.equal(
    fs.existsSync(path.join(root, ".flow", "debt", "backlog.json")),
    false,
  );
});

test("stale handles fail closed while bounded recovery distinguishes retryable and unknown state", () => {
  const root = repository();
  const now = 1_000;
  const handle = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Stale")] },
    now,
  });

  assert.deepEqual(
    recoverFlowDebtPreparation({ repositoryRoot: root, handle, now }),
    {
      status: "safely-retryable",
      operation: "create",
    },
  );
  writeBacklog(root, appendDrafts(emptyBacklog(), [draft("Concurrent")]));
  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now,
      approved: true,
    }),
    {
      status: "stale",
      operation: "create",
    },
  );
  assert.deepEqual(
    recoverFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now: handle.expiresAt,
    }),
    {
      status: "unknown",
      operation: "create",
    },
  );
});

test("done and archive preparations bind their exact source state", () => {
  const root = repository();
  const now = 1_000;
  const created = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Transition")] },
    now,
  });
  executeFlowDebtPreparation({
    repositoryRoot: root,
    handle: created,
    now,
    approved: true,
  });
  const id = JSON.parse(readBacklog(root)).items[0].id;

  const done = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "done",
    input: { id },
    now,
  });
  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle: done,
      now,
      approved: true,
    }),
    {
      status: "completed",
      operation: "done",
    },
  );
  const archive = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "archive",
    input: { id },
    now,
  });
  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle: archive,
      now,
      approved: true,
    }),
    {
      status: "completed",
      operation: "archive",
    },
  );
});

test("distinct current preparations share one critical section and cannot overwrite each other", () => {
  const root = repository();
  const now = 1_000;
  const first = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("First current preparation")] },
    now,
  });
  const second = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Second current preparation")] },
    now,
  });
  let nested;

  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle: first,
      now,
      approved: true,
      onLocked: () => {
        nested = executeFlowDebtPreparation({
          repositoryRoot: root,
          handle: second,
          now,
          approved: true,
        });
      },
    }),
    { status: "completed", operation: "create" },
  );
  assert.deepEqual(nested, { status: "safely-retryable", operation: "create" });
  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle: second,
      now,
      approved: true,
    }),
    { status: "stale", operation: "create" },
  );
  assert.equal(JSON.parse(readBacklog(root)).items.length, 1);
});

test("writer contention is observable and leaves a current preparation safely retryable", () => {
  const root = repository();
  const now = 1_000;
  writeBacklog(root, emptyBacklog());
  const handle = prepareFlowDebtExecution({
    repositoryRoot: root,
    repositoryId: repositoryId(root),
    operation: "create",
    input: { drafts: [draft("Locked")] },
    now,
  });
  fs.writeFileSync(
    path.join(root, ".flow", "debt", "backlog.json.flow-debt-writer.lock"),
    "test lock\n",
  );

  assert.deepEqual(
    executeFlowDebtPreparation({
      repositoryRoot: root,
      handle,
      now,
      approved: true,
    }),
    {
      status: "safely-retryable",
      operation: "create",
    },
  );
  assert.deepEqual(
    recoverFlowDebtPreparation({ repositoryRoot: root, handle, now }),
    {
      status: "safely-retryable",
      operation: "create",
    },
  );
});
