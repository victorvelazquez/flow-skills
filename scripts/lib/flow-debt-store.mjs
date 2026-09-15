import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  emptyBacklog,
  parseBacklog,
  serializeBacklog,
} from "../../core/flow-debt-backlog.mjs";

const MAX_BYTES = 1024 * 1024;
const MAX_ENTRIES = 16;
const legacyDirectories = new Set(["pending", "done"]);

function digest(backlog) {
  return createHash("sha256").update(serializeBacklog(backlog)).digest("hex");
}

function result(availability, backlog = emptyBacklog()) {
  return {
    availability,
    backlog,
    digest: digest(backlog),
    count: backlog.items.length,
  };
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function existing(root, target, kind) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) throw new Error("unsafe");
  if (kind === "directory" && !stat.isDirectory()) throw new Error("unsafe");
  if (kind === "file" && !stat.isFile()) throw new Error("unsafe");
  const resolved = fs.realpathSync.native(target);
  if (!contained(root, resolved)) throw new Error("unsafe");
  return stat;
}

function optional(root, target, kind) {
  try {
    return existing(root, target, kind);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function readFile(target) {
  const descriptor = fs.openSync(
    target,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size < 0 || stat.size > MAX_BYTES)
      throw new Error("unsafe");
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (read === 0) throw new Error("unsafe");
      offset += read;
    }
    return bytes.toString("utf8");
  } finally {
    fs.closeSync(descriptor);
  }
}

function legacyOrSafe(root, directory, { allowWriterLock = false } = {}) {
  const handle = fs.opendirSync(directory);
  try {
    let entries = 0;
    let legacy = false;
    while (true) {
      const entry = handle.readSync();
      if (!entry) break;
      if (++entries > MAX_ENTRIES) throw new Error("unsafe");
      const target = path.join(directory, entry.name);
      const stat = existing(root, target);
      if (legacyDirectories.has(entry.name)) {
        if (!stat.isDirectory()) throw new Error("unsafe");
        legacy = true;
      } else if (entry.name.endsWith(".md")) {
        if (!stat.isFile()) throw new Error("unsafe");
        legacy = true;
      } else if (
        entry.name === "backlog.json" ||
        (allowWriterLock && entry.name === "backlog.json.flow-debt-writer.lock")
      ) {
        if (!stat.isFile()) throw new Error("unsafe");
      } else throw new Error("unsafe");
    }
    return legacy;
  } finally {
    handle.closeSync();
  }
}

export function readFlowDebtStore({
  repositoryRoot,
  allowWriterLock = false,
} = {}) {
  try {
    if (typeof repositoryRoot !== "string" || !repositoryRoot)
      return result("unavailable");
    const requestedRoot = path.resolve(repositoryRoot);
    existing(requestedRoot, requestedRoot, "directory");
    const root = fs.realpathSync.native(requestedRoot);
    const flow = path.join(root, ".flow");
    if (!optional(root, flow, "directory")) return result("absent");
    const debt = path.join(flow, "debt");
    if (!optional(root, debt, "directory")) return result("absent");
    if (legacyOrSafe(root, debt, { allowWriterLock }))
      return result("legacy_store");
    const backlogPath = path.join(debt, "backlog.json");
    if (!optional(root, backlogPath, "file")) return result("absent");
    const backlog = parseBacklog(readFile(backlogPath));
    return result("available", backlog);
  } catch {
    return result("unavailable");
  }
}
