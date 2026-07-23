export function buildGhPrCreateArgs(target, title, head, options = {}) {
  const normalizedHead = typeof head === "string" ? head.trim() : "";
  if (!normalizedHead) throw new Error("PR head branch is required.");
  return ["pr", "create", "--base", target, "--head", normalizedHead, "--title", title, ...(options.draft ? ["--draft"] : []), "--body-file", "-"];
}

export function buildGhPrListArgs(repo, head, base) {
  return ["pr", "list", "--repo", repo, "--state", "open", "--head", head, "--base", base, "--json", "number,url,title,headRefName,baseRefName,headRefOid,body,labels,isDraft"];
}

export function buildGhPrEditArgs(repo, number, title) {
  return ["pr", "edit", String(number), "--repo", repo, "--title", title, "--body-file", "-"];
}

export function buildExactTagPushArgs(tagName) {
  const normalizedTag = typeof tagName === "string" ? tagName.trim() : "";
  if (!normalizedTag || !/^v\d+\.\d+\.\d+$/.test(normalizedTag)) throw new Error("A valid release tag name is required for publication.");
  return ["push", "origin", `refs/tags/${normalizedTag}`];
}

export function assertBumpPrSucceeded(result) {
  if (result?.success === true) return;
  throw new Error(`Required bump PR failed; release PR creation was not attempted: ${result?.error || result?.output || "unknown failure"}`);
}

export function assertRequiredPrResultsSucceeded(results) {
  const failed = results.filter((result) => !result || result.success !== true
    || ((result.action === "create" || result.action === "update") && !result.prUrl));
  if (failed.length === 0) return;
  const details = failed.map((result) => `${result?.target || "unknown target"}: ${result?.error || result?.output || "malformed PR operation result"}`).join("; ");
  throw new Error(`Required PR creation failed: ${details}`);
}
