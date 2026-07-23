import assert from "node:assert/strict";
import test from "node:test";

import { groupWorkUnits } from "../scripts/lib/flow-work-units.mjs";

test("implementation, tests, and docs for one behavior stay in one work unit", () => {
  const result = groupWorkUnits([
    { path: "src/auth/login.mjs", feature: "auth", type: "source" },
    { path: "tests/auth/login.test.mjs", feature: "auth", type: "test" },
    { path: "docs/auth/login.md", feature: "auth", type: "doc" },
  ]);
  assert.deepEqual(result.ambiguities, []);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].key, "behavior:auth");
  assert.deepEqual(result.groups[0].files.map((file) => file.path), [
    "src/auth/login.mjs",
    "tests/auth/login.test.mjs",
    "docs/auth/login.md",
  ]);
});

test("support shared by multiple behaviors fails as ambiguous", () => {
  const result = groupWorkUnits([
    { path: "src/auth/login.mjs", feature: "auth", type: "source" },
    { path: "src/users/list.mjs", feature: "users", type: "source" },
    { path: "tests/integration.test.mjs", feature: "tests", type: "test" },
  ]);
  assert.equal(result.ambiguities.length, 1);
  assert.deepEqual(result.ambiguities[0].candidateGroups, ["behavior:auth", "behavior:users"]);
});
