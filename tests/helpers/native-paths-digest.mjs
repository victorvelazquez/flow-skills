import { createHash } from "node:crypto";

export function nativePathsDigest(paths) {
  const canonicalPaths = [...new Set((paths || [])
    .map((value) => String(value || "").replace(/\\/g, "/").trim())
    .filter(Boolean))].sort();
  const hash = createHash("sha256");
  hash.update("gentle-ai.paths/v1\0");
  for (const logicalPath of canonicalPaths) {
    const value = Buffer.from(logicalPath);
    hash.update(`${value.length}\0`);
    hash.update(value);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}
