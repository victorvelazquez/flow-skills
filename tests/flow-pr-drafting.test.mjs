import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  commitDraftingHints,
  discoverPrTemplate,
  MAX_TEMPLATE_BYTES,
  parseConventionalSubject,
} from "../scripts/lib/flow-pr-drafting.mjs";

const commit = (subject, body = "") => ({ subject, body });
const repository = () => fs.mkdtempSync(path.join(os.tmpdir(), "flow-pr-drafting-"));
const write = (root, relative, content) => {
  const file = path.join(root, ...relative.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
};

test("single Conventional Commit preserves an exact scoped breaking title", () => {
  const subject = "feat(parser)!: preserve exact subject";
  assert.deepEqual(parseConventionalSubject(subject), { subject, type: "feat", scope: "parser", breaking: true, outcome: "preserve exact subject" });
  const hints = commitDraftingHints([commit(subject)]);
  assert.equal(hints.suggestedTitle, subject);
  assert.equal(hints.breaking, true);
});

test("generic custom types are valid without a closed taxonomy", () => {
  const hints = commitDraftingHints([commit("security(auth): rotate signing key")]);
  assert.equal(hints.suggestedTitle, "security(auth): rotate signing key");
  assert.deepEqual(hints.types, ["security"]);
});

test("invalid subjects expose structured hints without an automatic title", () => {
  for (const subject of ["Feat: uppercase", "feat missing separator", "feat: ", "1feat: invalid"]) {
    const hints = commitDraftingHints([commit(subject)]);
    assert.equal(hints.suggestedTitle, null);
    assert.equal(hints.invalidCommitCount, 1);
  }
});

test("multiple commits suggest a title only for an exact shared outcome", () => {
  const same = commitDraftingHints([commit("fix(api): reject stale token"), commit("fix(api): reject stale token")]);
  assert.equal(same.suggestedTitle, "fix(api): reject stale token");
  assert.equal(same.commonScope, "api");

  const scopes = commitDraftingHints([commit("fix(api): reject stale token"), commit("fix(ui): reject stale token")]);
  assert.equal(scopes.suggestedTitle, "fix: reject stale token");
  assert.equal(scopes.commonType, "fix");
  assert.equal(scopes.commonScope, null);

  const outcomes = commitDraftingHints([commit("fix(api): reject stale token"), commit("fix(api): report stale token")]);
  assert.equal(outcomes.suggestedTitle, null);
  const mixed = commitDraftingHints([commit("fix(api): reject stale token"), commit("docs(api): reject stale token")]);
  assert.equal(mixed.suggestedTitle, null);
  assert.deepEqual(mixed.types, ["docs", "fix"]);
});

test("breaking footers set a compact flag without exposing commit bodies", () => {
  const secret = "BREAKING CHANGE: callers must provide a private migration detail";
  const hints = commitDraftingHints([commit("feat(api): update contract", `Context.\n\n${secret}\nReviewed-by: Test`) ]);
  assert.equal(hints.breaking, true);
  assert.equal(hints.suggestedTitle, "feat(api): update contract");
  assert.doesNotMatch(JSON.stringify(hints), /private migration detail|BREAKING CHANGE/);
  assert.equal(commitDraftingHints([commit("feat: safe", "Mention BREAKING CHANGE: inline only.")]).breaking, false);
  assert.equal(commitDraftingHints([commit("feat: safe", "Body prose.\nBREAKING CHANGE: missing footer separation")]).breaking, false);
  assert.equal(commitDraftingHints([commit("feat: change", "BREAKING CHANGE: footer-only impact")]).breaking, true);
  assert.equal(commitDraftingHints([commit("feat: change", "Body prose.\n\nBREAKING CHANGE: separated footer impact")]).breaking, true);
  assert.equal(commitDraftingHints([commit("feat: change", "BREAKING-CHANGE: hyphenated footer impact")]).breaking, true);
});

test("unique standard repository template exposes bounded drafting content", () => {
  const root = repository();
  const content = "## Summary\n\n## Validation\n- [ ] Not run\n";
  write(root, ".github/PULL_REQUEST_TEMPLATE.md", content);
  assert.deepEqual(discoverPrTemplate(root), { status: "available", path: ".github/PULL_REQUEST_TEMPLATE.md", bytes: Buffer.byteLength(content), content });
});

test("standard lowercase single-file template locations are supported", () => {
  const root = repository(); const content = "## Changes\n";
  write(root, "docs/pull_request_template.md", content);
  const result = discoverPrTemplate(root);
  assert.equal(result.status, "available"); assert.equal(result.path.toLowerCase(), "docs/pull_request_template.md"); assert.equal(result.bytes, Buffer.byteLength(content)); assert.equal(result.content, content);
});

test("template discovery reports none and multiple candidates without content", () => {
  assert.deepEqual(discoverPrTemplate(repository()), { status: "none" });
  const root = repository();
  write(root, ".github/PULL_REQUEST_TEMPLATE/feature.md", "secret feature body");
  write(root, ".github/PULL_REQUEST_TEMPLATE/fix.md", "secret fix body");
  const result = discoverPrTemplate(root);
  assert.equal(result.status, "ambiguous");
  assert.deepEqual(result.candidates, [".github/PULL_REQUEST_TEMPLATE/feature.md", ".github/PULL_REQUEST_TEMPLATE/fix.md"]);
  assert.doesNotMatch(JSON.stringify(result), /secret/);
});

test("unsafe templates degrade to bounded unavailable metadata", async (t) => {
  await t.test("oversized", () => {
    const root = repository(); write(root, "PULL_REQUEST_TEMPLATE.md", "x".repeat(MAX_TEMPLATE_BYTES + 1));
    assert.deepEqual(discoverPrTemplate(root), { status: "unavailable", candidates: ["PULL_REQUEST_TEMPLATE.md"], reason: "oversized" });
  });
  await t.test("symlink and escaped target", (context) => {
    const root = repository(); const outside = write(repository(), "outside.md", "outside secret");
    const link = path.join(root, "PULL_REQUEST_TEMPLATE.md");
    try { fs.symlinkSync(outside, link, "file"); } catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { context.skip(`File symlinks unavailable: ${error.code}`); return; } throw error; }
    const result = discoverPrTemplate(root);
    assert.equal(result.status, "unavailable"); assert.deepEqual(result.candidates, ["PULL_REQUEST_TEMPLATE.md"]); assert.doesNotMatch(JSON.stringify(result), /outside secret/);
  });
  await t.test("unreadable where permissions are enforced", (context) => {
    if (process.platform === "win32") { context.skip("Portable chmod unreadability is unavailable on Windows."); return; }
    const root = repository(); const file = write(root, "docs/PULL_REQUEST_TEMPLATE.md", "private"); fs.chmodSync(file, 0o000);
    try { fs.readFileSync(file); context.skip("The current user can read chmod 000 files."); return; } catch {}
    assert.equal(discoverPrTemplate(root).status, "unavailable");
  });
});
