import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import * as debt from "../core/flow-debt-backlog.mjs";
import * as preparation from "../core/flow-debt-preparation.mjs";
import { itemId } from "../core/flow-debt-contract.mjs";

const now = 1_700_000_000_000;
const base = JSON.parse(
  '{"schema":"flow-debt-draft/v1","problem":"Parser has an unsafe fallback.","priority":"p1","severity":"high","scope":["scripts/parser.mjs"],"acceptanceCriteria":["Reject unsafe input"],"verification":["node --test tests/parser.test.mjs"],"producer":{"kind":"audit","reference":"audit-42"},"evidence":[{"reference":"src:42","summary":"Unsafe fallback exists."}]}',
);
const draft = (title = "Parser debt") => ({ ...base, title });
const prepare = (method, backlog, input) =>
  method({ repositoryId: "repo-42", backlog, ...input }, { now });
const validate = (handle, backlog, input, at = now) =>
  preparation.validatePreparation(
    handle,
    { repositoryId: "repo-42", backlog, input },
    { now: at },
  );
const rejects = (code, action) => assert.throws(action, { code });

test("preparation is pure, deterministic, bound, and checksum-only", () => {
  const incoming = draft(),
    pending = debt.appendDrafts(debt.emptyBacklog(), [incoming]);
  const done = {
    ...pending,
    items: pending.items.map((item) => ({ ...item, status: "done" })),
  };
  const cases = [
    [
      "create",
      preparation.prepareCreate,
      debt.emptyBacklog(),
      { drafts: [incoming] },
    ],
    ["done", preparation.prepareDone, pending, { id: itemId(incoming) }],
    ["archive", preparation.prepareArchive, done, { id: itemId(incoming) }],
  ];
  const before = JSON.stringify(cases);
  const handles = cases.map(([_operation, method, backlog, input]) =>
    prepare(method, backlog, input),
  );

  for (const [index, handle] of handles.entries()) {
    const [operation, , backlog, input] = cases[index];
    assert.equal(handle.schema, preparation.PREPARATION_SCHEMA);
    assert.equal(handle.operation, operation);
    assert.equal(handle.integrity, preparation.PREPARATION_INTEGRITY);
    assert.equal(
      handle.expiresAt - handle.issuedAt,
      preparation.PREPARATION_TTL_MS,
    );
    assert.deepEqual(validate(handle, backlog, input), handle);
  }
  assert.equal(JSON.stringify(cases), before);

  const [handle, , , backlog, input] = [handles[0], ...cases[0]];
  const { checksum, ...payload } = handle;
  assert.equal(
    checksum,
    createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
  );
  assert.deepEqual(handle, prepare(preparation.prepareCreate, backlog, input));
  assert.deepEqual(
    validate(handle, backlog, input, now + preparation.PREPARATION_TTL_MS - 1),
    handle,
  );
  assert.deepEqual(
    validate(handle, backlog, { drafts: [draft("  Parser debt  ")] }),
    handle,
  );
  for (const [code, action] of Object.entries({
    preparation_expired: () =>
      validate(handle, backlog, input, now + preparation.PREPARATION_TTL_MS),
    repository_mismatch: () =>
      preparation.validatePreparation(
        handle,
        { repositoryId: "other", backlog, input },
        { now },
      ),
    backlog_mismatch: () =>
      validate(
        handle,
        debt.appendDrafts(backlog, [draft("Other debt")]),
        input,
      ),
    input_mismatch: () =>
      validate(handle, backlog, { drafts: [draft("Other debt")] }),
    integrity_mismatch: () =>
      validate({ ...handle, repositoryId: "repo-43" }, backlog, input),
    invalid_input: () =>
      prepare(preparation.prepareCreate, backlog, { drafts: [] }),
    invalid_preparation: () => preparation.validatePreparation({}, {}),
    invalid_transition: () =>
      prepare(preparation.prepareArchive, pending, { id: itemId(incoming) }),
  }))
    rejects(code, action);
});
