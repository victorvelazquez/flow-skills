import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import flowPrPiExtension from "../hosts/pi/extensions/flow-pr.js";
import { identity } from "../scripts/lib/flow-pr-contracts.mjs";
import {
  buildSemanticDraft,
  directFlowPr,
  FlowPrRuntimeError,
  materializeIntent,
  prepareArgs,
  verifiedProjection,
} from "../scripts/lib/flow-pr-pi-extension.mjs";

const context = {
  repository: "owner/repo",
  branch: "feat/direct-pr",
  base: "main",
  delivery: {
    target: "owner/repo",
    pushRemote: "origin",
    pushRepository: "owner/repo",
  },
  changes: {
    commits: ["feat(ui): add direct publish"],
    files: ["src/direct.ts"],
    drafting: {
      suggestedTitle: "feat(ui): add direct publish",
      breaking: false,
      commitCount: 1,
    },
  },
  template: {
    status: "available",
    content: "## Summary\n\n## Validation\n- [ ] QA\n",
  },
};

function execSequence(outputs, calls) {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    const next = outputs.shift();
    assert.ok(next, "unexpected exec call");
    return {
      stdout: `${JSON.stringify(next)}\n`,
      stderr: "",
      code: next.exit ?? 0,
      killed: false,
    };
  };
}

function approval() {
  const body = buildSemanticDraft(context).body;
  return {
    repository: "owner/repo",
    branchToBase: "owner:feat/direct-pr -> main",
    baseAuthority: { source: "branch", evidence: "main" },
    action: {
      git: "push",
      pullRequest: "create",
      expectation: "push and create",
    },
    title: "feat(ui): add direct publish",
    body: { bytes: Buffer.byteLength(body), sha256: identity(body) },
    draft: false,
    labels: { add: ["keep"], remove: [] },
    authorizedUpdateFields: ["title", "body", "draft", "labels"],
    delivery: {
      mode: "same-repo",
      target: "owner/repo",
      pushRemote: "origin",
      pushRepository: "owner/repo",
    },
  };
}

function intentTemplate() {
  return JSON.stringify(
    {
      schema: "flow-pr/intent-v2",
      title: "",
      body: "",
      draft: false,
      labels: { add: ["keep"], remove: [] },
      updateExisting: ["title", "body", "draft", "labels"],
      deliveryMode: "same-repo",
      push: "publish",
    },
    null,
    2,
  );
}

test("direct command accepts only explicit runtime prepare arguments", () => {
  assert.deepEqual(prepareArgs(""), ["--prepare"]);
  assert.deepEqual(prepareArgs("--base develop --push-remote fork"), [
    "--prepare",
    "--base",
    "develop",
    "--push-remote",
    "fork",
  ]);
  assert.throws(
    () => prepareArgs("--execute --handle h"),
    /Unsupported \/flow-pr argument/,
  );
});

test("registered command requires native confirmation and cannot execute without UI", async () => {
  const handlers = new Map();
  let execCalls = 0;
  const notifications = [];
  flowPrPiExtension({
    registerCommand: (name, command) => handlers.set(name, command.handler),
    exec: async () => {
      execCalls += 1;
      assert.fail("no runtime call for noninteractive input");
    },
  });
  const command = handlers.get("flow-pr");
  assert.equal(typeof command, "function");
  const ctx = {
    mode: "tui",
    cwd: "/repo",
    ui: { notify: (message) => notifications.push(message) },
  };
  await command("", { ...ctx, hasUI: false });
  await command("", { ...ctx, mode: "rpc", hasUI: true });
  assert.equal(execCalls, 0);
  assert.equal(notifications.length, 2);
});

test("registered command confirms finalized summary before one execution", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-input-"));
  try {
    const intentPath = path.join(directory, "intent.json");
    fs.writeFileSync(intentPath, intentTemplate());
    const handlers = new Map();
    const calls = [];
    const notifications = [];
    const approvals = [];
    const sent = [];
    const outputs = [
      {
        schema: "flow-pr/prepare-context-v2",
        status: "prepared",
        phase: "prepare",
        handle: "context.handle",
        intentPath,
        context,
      },
      {
        schema: "flow-pr/preparation-v2",
        status: "prepared",
        phase: "prepare",
        handle: "request.handle",
        approval: approval(),
      },
      {
        schema: "flow-pr/result-v1",
        status: "success",
        phase: "verify",
        pr: { url: "https://example.test/pr/1", handle: "private" },
        publication: {
          repository: "owner/repo",
          branch: "feat/direct-pr",
          base: "main",
          baseOid: "a".repeat(40),
          headOid: "b".repeat(40),
          candidate: {
            baseOid: "a".repeat(40),
            headOid: "b".repeat(40),
            commitCount: 1,
            changedPaths: ["src/direct.ts"],
            commitSubjects: ["feat(ui): add direct publish"],
            truncated: false,
          },
        },
        intentPath: "private",
      },
    ];
    flowPrPiExtension({
      registerCommand: (name, command) => handlers.set(name, command.handler),
      exec: execSequence(outputs, calls),
      sendMessage: (...args) => sent.push(args),
    });
    const ctx = {
      mode: "tui",
      hasUI: true,
      cwd: directory,
      ui: {
        notify: (message) => notifications.push(message),
        confirm: async (...args) => {
          approvals.push(args);
          return true;
        },
      },
    };
    await handlers.get("flow-pr")("", ctx);
    assert.equal(calls.length, 3);
    assert.deepEqual(
      calls.map((call) => call.args.slice(1)),
      [
        ["--prepare"],
        ["--prepare", "--handle", "context.handle"],
        ["--execute", "--handle", "request.handle"],
      ],
    );
    assert.match(notifications.at(-1), /https:\/\/example\.test\/pr\/1/);
    assert.equal(sent.length, 1);
    assert.equal(sent[0][0].customType, "flow-pr-verified");
    assert.equal(sent[0][0].display, false);
    assert.deepEqual(sent[0][1], { triggerTurn: true, deliverAs: "followUp" });
    const packagedContract = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../skills/flow-pr/references/output-contract.md",
    );
    assert.ok(fs.statSync(packagedContract).isFile());
    assert.ok(sent[0][0].content.includes(JSON.stringify(packagedContract)));
    assert.ok(
      !packagedContract.startsWith(directory + path.sep),
      "contract is package-owned, not target cwd",
    );
    assert.doesNotMatch(
      sent[0][0].content,
      /private|intentPath|handle|context\.handle|request\.handle/,
    );
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].length, 2, "no countdown option");
    assert.match(approvals[0][1], /Repository: owner\/repo/);
    assert.match(approvals[0][1], /Branch: owner:feat\/direct-pr -> main/);
    assert.match(approvals[0][1], /Create PR.*push.*origin/i);
    assert.match(approvals[0][1], /Body: .*preview: ## Summary/);
    assert.doesNotMatch(
      approvals[0][1],
      /Template:|Not provided.*Not provided/s,
    );
    assert.doesNotMatch(
      approvals[0][1],
      /\{\s*"repository"|"sha256"|request\.handle|intent\.json/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("verified projection is bounded and excludes runtime authority", async () => {
  const projection = verifiedProjection({
    schema: "flow-pr/result-v1",
    status: "success",
    phase: "verify",
    pr: { url: "https://example.test/pr/1", handle: "secret" },
    publication: {
      repository: "owner/repo",
      branch: "feature",
      base: "main",
      baseOid: "a".repeat(40),
      headOid: "b".repeat(40),
      candidate: {
        baseOid: "a".repeat(40),
        headOid: "b".repeat(40),
        commitCount: 1,
        changedPaths: ["src/a.ts"],
        commitSubjects: ["fix: update"],
        truncated: false,
        handle: "secret",
      },
    },
    handle: "secret",
    intentPath: "secret",
  });
  assert.equal(projection.pr.url, "https://example.test/pr/1");
  assert.doesNotMatch(JSON.stringify(projection), /secret|handle|intentPath/);
  assert.equal(
    verifiedProjection({
      schema: "flow-pr/result-v1",
      status: "success",
      phase: "verify",
      pr: null,
    }),
    null,
  );
});

test("verified projection degrades unsafe or missing candidate to status-only handoff", () => {
  const base = {
    schema: "flow-pr/result-v1",
    status: "noop",
    phase: "verify",
    pr: { url: "https://example.test/pr/2", handle: "secret" },
    handle: "secret",
  };
  for (const publication of [
    undefined,
    { candidate: { truncated: true, handle: "secret" } },
    { candidate: { changedPaths: ["evil\ncommand"], handle: "secret" } },
  ]) {
    assert.deepEqual(verifiedProjection({ ...base, publication }), {
      schema: "flow-pr/result-v1",
      status: "noop",
      phase: "verify",
      pr: { url: "https://example.test/pr/2" },
      publication: null,
    });
  }
  assert.equal(
    verifiedProjection({ ...base, pr: { url: "javascript:alert(1)" } }),
    null,
  );
});

test("handoff failure retains verified publication without repeating execute", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-display-"));
  try {
    const intentPath = path.join(directory, "intent.json");
    fs.writeFileSync(intentPath, intentTemplate());
    const handlers = new Map();
    const calls = [];
    const notifications = [];
    const outputs = [
      {
        schema: "flow-pr/prepare-context-v2",
        status: "prepared",
        phase: "prepare",
        handle: "context.handle",
        intentPath,
        context,
      },
      {
        schema: "flow-pr/preparation-v2",
        status: "prepared",
        phase: "prepare",
        handle: "request.handle",
        approval: approval(),
      },
      {
        schema: "flow-pr/result-v1",
        status: "success",
        phase: "verify",
        pr: { url: "https://example.test/pr/1" },
        publication: {
          repository: "owner/repo",
          branch: "feat/direct-pr",
          base: "main",
          baseOid: "a".repeat(40),
          headOid: "b".repeat(40),
          candidate: {
            baseOid: "a".repeat(40),
            headOid: "b".repeat(40),
            commitCount: 1,
            commitSubjects: ["docs: update guide"],
            changedPaths: ["docs/guide.md"],
            truncated: false,
          },
        },
      },
    ];
    flowPrPiExtension({
      registerCommand: (name, command) => handlers.set(name, command.handler),
      exec: execSequence(outputs, calls),
      sendMessage: () => {
        throw new Error("display unavailable");
      },
    });
    await handlers.get("flow-pr")("", {
      mode: "tui",
      hasUI: true,
      cwd: directory,
      ui: {
        confirm: async () => true,
        notify: (message) => notifications.push(message),
      },
    });
    assert.equal(calls.length, 3);
    assert.equal(
      calls.filter((call) => call.args.includes("--execute")).length,
      1,
    );
    assert.ok(
      notifications.some((message) =>
        /Flow PR success: https:\/\/example\.test\/pr\/1/.test(message),
      ),
    );
    assert.ok(
      notifications.some((message) =>
        /Presentation handoff failed; publication is verified/.test(message),
      ),
    );
    assert.ok(
      notifications.every(
        (message) => !/stopped or outcome unknown/.test(message),
      ),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("verified noop with missing, truncated, or unsafe candidate sends one status-only follow-up", async () => {
  for (const publication of [
    undefined,
    { candidate: { truncated: true, handle: "private" } },
    { candidate: { changedPaths: ["unsafe\npath"], handle: "private" } },
  ]) {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "flow-pr-status-only-"),
    );
    try {
      const intentPath = path.join(directory, "intent.json");
      fs.writeFileSync(intentPath, intentTemplate());
      const handlers = new Map(),
        calls = [],
        sent = [],
        notifications = [];
      flowPrPiExtension({
        registerCommand: (name, command) => handlers.set(name, command.handler),
        exec: execSequence(
          [
            {
              schema: "flow-pr/prepare-context-v2",
              status: "prepared",
              phase: "prepare",
              handle: "context.handle",
              intentPath,
              context,
            },
            {
              schema: "flow-pr/preparation-v2",
              status: "prepared",
              phase: "prepare",
              handle: "request.handle",
              approval: approval(),
            },
            {
              schema: "flow-pr/result-v1",
              status: "noop",
              phase: "verify",
              pr: { url: "https://example.test/pr/2" },
              publication,
              handle: "private",
            },
          ],
          calls,
        ),
        sendMessage: (...args) => sent.push(args),
      });
      await handlers.get("flow-pr")("", {
        mode: "tui",
        hasUI: true,
        cwd: directory,
        ui: {
          confirm: async () => true,
          notify: (message) => notifications.push(message),
        },
      });
      assert.equal(
        calls.filter((call) => call.args.includes("--execute")).length,
        1,
      );
      assert.equal(sent.length, 1);
      assert.match(sent[0][0].content, /"publication":null/);
      assert.doesNotMatch(
        sent[0][0].content,
        /private|context\.handle|request\.handle/,
      );
      assert.match(
        notifications[0],
        /Flow PR noop: https:\/\/example\.test\/pr\/2/,
      );
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("decline, failed execute, and verified result without PR never send a handoff", async () => {
  for (const scenario of ["decline", "failure", "no-pr"]) {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "flow-pr-no-handoff-"),
    );
    try {
      const intentPath = path.join(directory, "intent.json");
      fs.writeFileSync(intentPath, intentTemplate());
      const handlers = new Map();
      const calls = [];
      const sent = [];
      const notifications = [];
      const outputs = [
        {
          schema: "flow-pr/prepare-context-v2",
          status: "prepared",
          phase: "prepare",
          handle: "context.handle",
          intentPath,
          context,
        },
        {
          schema: "flow-pr/preparation-v2",
          status: "prepared",
          phase: "prepare",
          handle: "request.handle",
          approval: approval(),
        },
        ...(scenario === "decline"
          ? []
          : [
              {
                schema: "flow-pr/result-v1",
                status: scenario === "failure" ? "failure" : "success",
                phase: "verify",
                pr: null,
              },
            ]),
      ];
      flowPrPiExtension({
        registerCommand: (name, command) => handlers.set(name, command.handler),
        exec: execSequence(outputs, calls),
        sendMessage: (...args) => sent.push(args),
      });
      await handlers.get("flow-pr")("", {
        mode: "tui",
        hasUI: true,
        cwd: directory,
        ui: {
          confirm: async () => scenario !== "decline",
          notify: (message) => notifications.push(message),
        },
      });
      assert.equal(sent.length, 0, scenario);
      assert.equal(
        calls.filter((call) => call.args.includes("--execute")).length,
        scenario === "decline" ? 0 : 1,
      );
      assert.ok(notifications.length > 0);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }
});

test("update and fork approval summaries show material facts without JSON", async () => {
  for (const [scenario, summary, required] of [
    [
      "update",
      {
        ...approval(),
        action: {
          git: "verify",
          pullRequest: "update",
          expectation: "verify and update",
        },
        labels: { add: [], remove: ["old"] },
      },
      [
        /Action: Update PR; verify via origin/,
        /Update fields: title, body, draft, labels/,
        /Labels: none added; -old/,
      ],
    ],
    [
      "fork",
      {
        ...approval(),
        delivery: {
          mode: "fork",
          target: "owner/repo",
          pushRemote: "fork",
          pushRepository: "contributor/repo",
        },
      },
      [
        /Action: Create PR; push via fork/,
        /Delivery: fork to owner\/repo \(push repository: contributor\/repo\)/,
      ],
    ],
  ]) {
    const calls = [];
    let message;
    await assert.rejects(
      () =>
        directFlowPr("", {
          mode: "tui",
          runtimePath: "/repo/scripts/flow-pr.mjs",
          cwd: "/repo",
          exec: execSequence(
            [
              {
                schema: "flow-pr/prepare-context-v2",
                status: "prepared",
                phase: "prepare",
                handle: "context.handle",
                intentPath: "/tmp/intent.json",
                context,
              },
              {
                schema: "flow-pr/preparation-v2",
                status: "prepared",
                phase: "prepare",
                handle: "request.handle",
                approval: summary,
              },
            ],
            calls,
          ),
          readFile: async () => intentTemplate(),
          writeFile: async () => undefined,
          confirm: async (_title, text) => {
            message = text;
            return false;
          },
        }),
      /approval declined/i,
      scenario,
    );
    assert.equal(calls.length, 2, scenario);
    for (const pattern of required) assert.match(message, pattern, scenario);
    assert.doesNotMatch(
      message,
      /\{\s*"repository"|"sha256"|request\.handle/,
      scenario,
    );
  }
});

test("checked template outside headings falls back with notice only in approval", async () => {
  const unsafe = {
    ...context,
    template: {
      status: "available",
      content: "- [X] Published\n## Changes\n## Summary\n## Validation",
    },
  };
  const calls = [];
  let message;
  await assert.rejects(
    () =>
      directFlowPr("", {
        mode: "tui",
        runtimePath: "/repo/scripts/flow-pr.mjs",
        cwd: "/repo",
        exec: execSequence(
          [
            {
              schema: "flow-pr/prepare-context-v2",
              status: "prepared",
              phase: "prepare",
              handle: "context.handle",
              intentPath: "/tmp/intent.json",
              context: unsafe,
            },
            {
              schema: "flow-pr/preparation-v2",
              status: "prepared",
              phase: "prepare",
              handle: "request.handle",
              approval: approval(),
            },
          ],
          calls,
        ),
        readFile: async () => intentTemplate(),
        writeFile: async (_file, text) => {
          assert.deepEqual(
            Object.keys(JSON.parse(text)).sort(),
            Object.keys(JSON.parse(intentTemplate())).sort(),
          );
          assert.doesNotMatch(JSON.parse(text).body, /Template:|Published/);
        },
        confirm: async (_title, text) => {
          message = text;
          return false;
        },
      }),
    /approval declined/,
  );
  assert.equal(calls.length, 2);
  assert.doesNotMatch(message, /Template:|Published/);
  assert.match(message, /## Summary[\s\S]*## Changes[\s\S]*## Validation/);
});

test("semantic draft never imports unchecked template validation claims", () => {
  const draft = buildSemanticDraft(context);
  assert.equal(draft.title, "feat(ui): add direct publish");
  assert.equal(draft.draft, false);
  assert.equal(buildSemanticDraft(context, true).draft, true);
  assert.match(draft.body, /## Summary/);
  assert.match(draft.body, /## Validation/);
  assert.match(draft.body, /feat\(ui\): add direct publish/);
  assert.match(draft.body, /src\/direct\.ts/);
  assert.match(draft.body, /Not provided/);
  assert.doesNotMatch(
    buildSemanticDraft({
      ...context,
      template: { status: "available", content: "- [x] Tests passed" },
    }).body,
    /Tests passed/,
  );
});

test("intent materialization targets only title body and draft lines", () => {
  const original = intentTemplate();
  const materialized = materializeIntent(original, {
    title: "T",
    body: "B",
    draft: true,
  });
  const parsed = JSON.parse(materialized);
  assert.equal(parsed.title, "T");
  assert.equal(parsed.body, "B");
  assert.equal(parsed.draft, true);
  const multiline = buildSemanticDraft(context).body;
  const materializedBody = JSON.parse(
    materializeIntent(original, { title: "T", body: multiline, draft: false }),
  ).body;
  assert.equal(
    materializedBody,
    multiline,
    "intent JSON round-trip preserves body newlines exactly",
  );
  assert.equal(identity(materializedBody), approval().body.sha256);
  assert.deepEqual(parsed.labels, { add: ["keep"], remove: [] });
  assert.deepEqual(parsed.updateExisting, ["title", "body", "draft", "labels"]);
  assert.equal(parsed.deliveryMode, "same-repo");
  assert.equal(parsed.push, "publish");
  const operationalOriginal = original.slice(original.indexOf('\n  "labels"'));
  const operationalMaterialized = materialized
    .trimEnd()
    .slice(materialized.indexOf('\n  "labels"'));
  assert.equal(operationalMaterialized, operationalOriginal);
  assert.throws(
    () =>
      materializeIntent(original, {
        title: "T",
        body: "B",
        draft: false,
        labels: { add: [] },
      }),
    /Unsupported draft field/,
  );
  assert.throws(
    () =>
      materializeIntent(
        original.replace(
          '  "push": "publish"',
          '  "push": "publish",\n  "extra": true',
        ),
        { title: "T", body: "B", draft: false },
      ),
    /Unexpected intent field/,
  );
});

test("direct command is TUI-only and owns exact prepare finalize execute argv once", async () => {
  const calls = [];
  const files = new Map([
    ["/tmp/flow-pr-request-x/intent.json", intentTemplate()],
  ]);
  const result = await directFlowPr("", {
    mode: "tui",
    runtimePath: "/repo/scripts/flow-pr.mjs",
    cwd: "/repo",
    exec: execSequence(
      [
        {
          schema: "flow-pr/prepare-context-v2",
          status: "prepared",
          exit: 0,
          phase: "prepare",
          handle: "context.handle",
          intentPath: "/tmp/flow-pr-request-x/intent.json",
          context,
        },
        {
          schema: "flow-pr/preparation-v2",
          status: "prepared",
          exit: 0,
          phase: "prepare",
          handle: "request.handle",
          approval: approval(),
        },
        {
          schema: "flow-pr/result-v1",
          status: "success",
          exit: 0,
          phase: "verify",
          pr: { url: "https://example.test/pr/1" },
          publication: { repository: "owner/repo", branch: "feat/direct-pr" },
        },
      ],
      calls,
    ),
    readFile: async (file) => files.get(file),
    writeFile: async (file, text) => files.set(file, text),
    confirm: async () => true,
  });

  assert.deepEqual(
    calls.map(({ command, args }) => [command, args]),
    [
      ["node", ["/repo/scripts/flow-pr.mjs", "--prepare"]],
      [
        "node",
        [
          "/repo/scripts/flow-pr.mjs",
          "--prepare",
          "--handle",
          "context.handle",
        ],
      ],
      [
        "node",
        [
          "/repo/scripts/flow-pr.mjs",
          "--execute",
          "--handle",
          "request.handle",
        ],
      ],
    ],
  );
  assert.equal(result.executed, true);
  assert.equal(result.text, "Flow PR success: https://example.test/pr/1");
  assert.match(
    files.get("/tmp/flow-pr-request-x/intent.json"),
    /feat\(ui\): add direct publish/,
  );

  await assert.rejects(
    () =>
      directFlowPr("", {
        mode: "rpc",
        runtimePath: "/repo/scripts/flow-pr.mjs",
        cwd: "/repo",
        exec: async () => assert.fail("must not execute outside TUI"),
        readFile: async () => intentTemplate(),
        writeFile: async () => undefined,
      }),
    /interactive Pi TUI mode/,
  );
});

test("direct command stops before execute on stale finalization or unverified result", async () => {
  const calls = [];
  const common = {
    mode: "tui",
    runtimePath: "/repo/scripts/flow-pr.mjs",
    cwd: "/repo",
    readFile: async () => intentTemplate(),
    writeFile: async () => undefined,
    confirm: async () => true,
  };
  await assert.rejects(
    () =>
      directFlowPr("", {
        ...common,
        exec: execSequence(
          [
            {
              schema: "flow-pr/prepare-context-v2",
              status: "prepared",
              exit: 0,
              phase: "prepare",
              handle: "context.handle",
              intentPath: "/tmp/flow-pr-request-x/intent.json",
              context,
            },
            {
              schema: "flow-pr/preparation-v2",
              status: "drift",
              exit: 0,
              phase: "prepare",
            },
          ],
          calls,
        ),
      }),
    (error) => {
      assert.ok(error instanceof FlowPrRuntimeError);
      assert.match(error.message, /Flow PR finalize returned drift/);
      assert.equal(error.envelope.status, "drift");
      return true;
    },
  );
  assert.equal(calls.length, 2);

  await assert.rejects(
    () =>
      directFlowPr("", {
        ...common,
        exec: execSequence(
          [
            {
              schema: "flow-pr/prepare-context-v2",
              status: "prepared",
              exit: 0,
              phase: "prepare",
              handle: "context.handle",
              intentPath: "/tmp/flow-pr-request-x/intent.json",
              context,
            },
            {
              schema: "flow-pr/preparation-v2",
              status: "prepared",
              exit: 0,
              phase: "prepare",
              handle: "request.handle",
              approval: approval(),
            },
            {
              schema: "flow-pr/result-v1",
              status: "partial",
              exit: 0,
              phase: "execute",
              pr: null,
            },
          ],
          [],
        ),
      }),
    (error) => {
      assert.ok(error instanceof FlowPrRuntimeError);
      assert.match(error.message, /Flow PR execute returned partial/);
      assert.equal(error.envelope.status, "partial");
      return true;
    },
  );
});

test("decline, absent UI, and thrown confirmation never execute", async () => {
  for (const confirm of [
    async () => false,
    async () => undefined,
    async () => {
      throw new Error("UI closed");
    },
    undefined,
  ]) {
    const calls = [];
    const outputs = [
      {
        schema: "flow-pr/prepare-context-v2",
        status: "prepared",
        phase: "prepare",
        handle: "context.handle",
        intentPath: "/tmp/intent.json",
        context,
      },
      {
        schema: "flow-pr/preparation-v2",
        status: "prepared",
        phase: "prepare",
        handle: "request.handle",
        approval: approval(),
      },
    ];
    await assert.rejects(
      () =>
        directFlowPr("", {
          mode: "tui",
          runtimePath: "/repo/scripts/flow-pr.mjs",
          cwd: "/repo",
          exec: execSequence(outputs, calls),
          readFile: async () => intentTemplate(),
          writeFile: async () => undefined,
          confirm,
        }),
      /approval|UI closed/i,
    );
    assert.equal(calls.length, 2);
  }
});

test("malformed and oversized finalized summaries stop before confirmation and execute", async () => {
  for (const summary of [
    { ...approval(), body: { bytes: 12, sha256: "bad" } },
    {
      ...approval(),
      body: { ...approval().body, bytes: approval().body.bytes + 1 },
    },
    { ...approval(), title: "x".repeat(8192) },
  ]) {
    const calls = [];
    let prompted = false;
    await assert.rejects(
      () =>
        directFlowPr("", {
          mode: "tui",
          runtimePath: "/repo/scripts/flow-pr.mjs",
          cwd: "/repo",
          exec: execSequence(
            [
              {
                schema: "flow-pr/prepare-context-v2",
                status: "prepared",
                phase: "prepare",
                handle: "context.handle",
                intentPath: "/tmp/intent.json",
                context,
              },
              {
                schema: "flow-pr/preparation-v2",
                status: "prepared",
                phase: "prepare",
                handle: "request.handle",
                approval: summary,
              },
            ],
            calls,
          ),
          readFile: async () => intentTemplate(),
          writeFile: async () => undefined,
          confirm: async () => {
            prompted = true;
            return true;
          },
        }),
      /approval summary|finalized body differs/i,
    );
    assert.equal(prompted, false);
    assert.equal(calls.length, 2);
  }
});

test("runtime nonzero envelopes are propagated without stderr reconstruction", async () => {
  await assert.rejects(
    () =>
      directFlowPr("", {
        mode: "tui",
        runtimePath: "/repo/scripts/flow-pr.mjs",
        cwd: "/repo",
        exec: async () => ({
          code: 1,
          stderr: "secret child process output",
          stdout: `${JSON.stringify({
            schema: "flow-pr/result-v1",
            status: "blocked",
            phase: "prepare",
            error: { diagnostics: { classification: "inspection-failure" } },
            recovery: {
              code: "prepare-again",
              message: "Prepare again after resolving repository state.",
              requiresFreshInspection: true,
            },
          })}\n`,
        }),
        readFile: async () => intentTemplate(),
        writeFile: async () => undefined,
      }),
    (error) => {
      assert.ok(error instanceof FlowPrRuntimeError);
      assert.equal(error.envelope.status, "blocked");
      assert.match(error.message, /inspection-failure/);
      assert.match(
        error.message,
        /Prepare again after resolving repository state/,
      );
      assert.doesNotMatch(
        error.message,
        /\[object Object\]|secret child process output/,
      );
      return true;
    },
  );
});
