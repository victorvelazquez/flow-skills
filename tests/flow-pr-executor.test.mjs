import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_GH_DIAGNOSTIC_BYTES,
  classifyGhCreateFailure,
  classifyGhCreateReason,
  invocationMode,
  prCreateHead,
  redactGhDiagnostic,
  truncateUtf8,
} from "../scripts/lib/flow-pr-executor.mjs";

test("Flow PR executor classifies create failures without relaying GitHub output", () => {
  const secret = "https://user:secret@example.test/private";
  const failure = classifyGhCreateFailure({
    ok: false,
    status: 1,
    stderr: `401 authentication required: ${secret}`,
    stdout: "",
  });

  assert.equal(failure.code, "pr-create-exit-nonzero");
  assert.equal(
    failure.message,
    "GitHub CLI diagnostics were withheld for privacy.",
  );
  assert.deepEqual(failure.diagnostics, {
    kind: "exit-nonzero",
    exitCode: 1,
    reasonCode: "auth-required",
    invocationMode: "default",
    message: "GitHub CLI diagnostics were withheld for privacy.",
  });
  assert.doesNotMatch(JSON.stringify(failure), /secret|example\.test/);
});

test("Flow PR executor bounds UTF-8 diagnostics and exposes deterministic helpers", () => {
  assert.equal(truncateUtf8("€x", 2), "");
  assert.equal(truncateUtf8("€x", 3), "€");
  assert.equal(
    redactGhDiagnostic("private output").length <= MAX_GH_DIAGNOSTIC_BYTES,
    true,
  );
  assert.equal(classifyGhCreateReason("rate limit exceeded"), "rate-limited");
  assert.equal(classifyGhCreateReason("unexpected"), "unknown");
  assert.equal(invocationMode({ FLOW_PR_GH: "custom-gh" }), "command-override");
  assert.equal(
    invocationMode({ FLOW_PR_GH_SCRIPT: "mock.mjs" }),
    "script-override",
  );
  assert.equal(
    prCreateHead({
      mode: "same-repo",
      head: { owner: "owner", ref: "feature/test" },
    }),
    "feature/test",
  );
  assert.equal(
    prCreateHead({
      mode: "fork",
      head: { owner: "owner", ref: "feature/test" },
    }),
    "owner:feature/test",
  );
});
