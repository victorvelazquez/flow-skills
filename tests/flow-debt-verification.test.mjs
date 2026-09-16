import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FLOW_DEBT_VERIFICATION_CATEGORIES,
  snapshotFlowDebtState,
  verifyFlowDebtMutationSafety,
} from "../scripts/lib/flow-debt-verification.mjs";

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "flow-debt-verification-"),
  );
  fs.mkdirSync(path.join(root, ".flow", "debt"), { recursive: true });
  fs.writeFileSync(path.join(root, ".flow", "debt", "backlog.json"), "{}\n");
  return root;
}

function passed(evidence) {
  return { available: true, passed: true, evidence };
}

function independent(evidence) {
  return { status: "pass", independent: true, evidence };
}

function source(text, path = "core/flow-debt.mjs") {
  return { path, text };
}

function authorityEvidence(hostOwnership, noPortableSelfAuthorization) {
  return {
    complete: true,
    hostOwnership: independent(hostOwnership),
    noPortableSelfAuthorization: independent(noPortableSelfAuthorization),
  };
}

function failed(evidence, reason) {
  return { status: "fail", independent: true, evidence, reason };
}

test("verification classifies every mutation-safety category and preserves its fixture", () => {
  const root = fixture();
  const before = snapshotFlowDebtState(root);

  const report = verifyFlowDebtMutationSafety({
    repositoryRoot: root,
    checks: {
      concurrency: passed("exclusive lock contention rejected"),
      "stale-handles": {
        passed: false,
        evidence: "bound state changed",
        reason: "stale",
      },
      residues: { available: false, reason: "residue fixture unavailable" },
      recovery: passed("recorded recovery was safely retryable"),
      rollback: { passed: false, evidence: "rollback was not recorded" },
      postcondition: passed("recorded bytes matched expected state"),
      "packaged-state": passed("package inventory contained required module"),
      "deployed-state": {
        available: false,
        reason: "host deployment unavailable",
      },
    },
    portableCore: {
      sources: [
        source("export function execute({ approved }) { return approved; }"),
      ],
      authorityEvidence: authorityEvidence(
        "host adapter approval boundary review",
        "independent portable-core authority review",
      ),
    },
  });

  assert.deepEqual(
    report.categories.map(({ category, status }) => [category, status]),
    [
      ["concurrency", "pass"],
      ["stale-handles", "fail"],
      ["residues", "skip"],
      ["recovery", "pass"],
      ["rollback", "fail"],
      ["postcondition", "pass"],
      ["packaged-state", "pass"],
      ["deployed-state", "skip"],
      ["portable-core-authority", "pass"],
    ],
  );
  assert.deepEqual(
    report.categories.map(({ category }) => category),
    FLOW_DEBT_VERIFICATION_CATEGORIES,
  );
  assert.equal(report.readOnly.status, "pass");
  assert.deepEqual(report.readOnly.before, before);
  assert.deepEqual(report.readOnly.after, before);
  assert.deepEqual(snapshotFlowDebtState(root), before);
});

test("deployment absence never passes and portable code cannot self-authorize", () => {
  const root = fixture();
  const report = verifyFlowDebtMutationSafety({
    repositoryRoot: root,
    portableCore: {
      sources: [source("const approved = true;")],
      authorityEvidence: {
        complete: true,
        hostOwnership: failed(
          "portable core asserted approval",
          "approval is not host-owned",
        ),
        noPortableSelfAuthorization: failed("portable core asserted approval"),
      },
    },
  });

  const deployed = report.categories.find(
    ({ category }) => category === "deployed-state",
  );
  const authority = report.categories.find(
    ({ category }) => category === "portable-core-authority",
  );
  assert.deepEqual(deployed, {
    category: "deployed-state",
    status: "skip",
    evidence: [],
    reason: "deployed capability was not supplied",
  });
  assert.equal(authority.status, "fail");
  assert.match(authority.reason, /host-owned/);
  assert.match(
    authority.evidence.join("\n"),
    /portable core asserted approval/,
  );
});

test("portable authority fails closed without complete independent evidence", () => {
  const root = fixture();
  const authority = (portableCore) =>
    verifyFlowDebtMutationSafety({
      repositoryRoot: root,
      portableCore,
    }).categories.find(
      ({ category }) => category === "portable-core-authority",
    );

  assert.equal(
    authority({
      approvalOwner: "host",
      sources: [{ path: "core/missing.mjs" }],
    }).status,
    "skip",
  );
  assert.equal(
    authority({
      approvalOwner: "host",
      sources: [
        source(
          "const approval = { granted: true }; use(approval.granted);",
          "core/authority.mjs",
        ),
      ],
      authorityEvidence: authorityEvidence(
        "claimed host approval boundary",
        "claimed portable-core review",
      ),
    }).status,
    "fail",
  );
});
