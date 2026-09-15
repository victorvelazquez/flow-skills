import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Replace one authorized Flow debt file while holding an exclusive sibling lock.
 * The temporary file and lock stay beside the target, so rename is local.
 *
 * This is a low-level primitive, not public mutation authority. Its optional
 * readFile and observeRename dependencies are deterministic test seams only.
 * It does not claim total TOCTOU protection or power-loss/crash durability.
 */
const LOCK_SUFFIX = ".flow-debt-writer.lock";
const TEMPORARY_MARKER = ".flow-debt-writer-";

function checkedTarget(target) {
  if (typeof target !== "string" || !path.isAbsolute(target))
    throw new Error("Flow debt writer target must be an absolute path.");
  const directory = path.dirname(target);
  if (!fs.statSync(directory).isDirectory())
    throw new Error("Flow debt writer target directory is unavailable.");
  if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())
    throw new Error("Flow debt writer target must not be a symbolic link.");
  return { target, directory };
}

function checkedBytes(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
    throw new Error("Flow debt writer requires byte input.");
  return Buffer.from(bytes);
}

function writeAll(descriptor, bytes) {
  for (let offset = 0; offset < bytes.length; ) {
    const written = fs.writeSync(
      descriptor,
      bytes,
      offset,
      bytes.length - offset,
    );
    if (written <= 0)
      throw new Error("Flow debt writer could not write bytes.");
    offset += written;
  }
}

function removeOwned(target) {
  try {
    fs.unlinkSync(target);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function writeLocked(destination, bytes, { readFile, observeRename } = {}) {
  const expected = checkedBytes(bytes);
  if (readFile !== undefined && typeof readFile !== "function")
    throw new Error("Flow debt writer readFile seam must be a function.");
  if (observeRename !== undefined && typeof observeRename !== "function")
    throw new Error("Flow debt writer observeRename seam must be a function.");

  let temporary;
  let temporaryOwned = false;
  try {
    temporary = path.join(
      destination.directory,
      `.${path.basename(destination.target)}${TEMPORARY_MARKER}${randomUUID()}.tmp`,
    );
    const temporaryDescriptor = fs.openSync(temporary, "wx", 0o600);
    temporaryOwned = true;
    try {
      writeAll(temporaryDescriptor, expected);
    } finally {
      fs.closeSync(temporaryDescriptor);
    }
    observeRename?.({ source: temporary, target: destination.target });
    fs.renameSync(temporary, destination.target);
    temporaryOwned = false;

    const actual = Buffer.from(
      (readFile || fs.readFileSync)(destination.target),
    );
    if (!actual.equals(expected))
      throw new Error("Flow debt writer postcondition verification failed.");
    return { target: destination.target, bytes: expected.length };
  } finally {
    if (temporaryOwned) removeOwned(temporary);
  }
}

/**
 * Hold the target's sibling lock across a bounded state read and atomic write.
 * `onLocked` is a deterministic test seam and cannot alter lock ownership.
 */
export function withFlowDebtWriteLock(
  { target },
  operation,
  { onLocked } = {},
) {
  const destination = checkedTarget(target);
  if (typeof operation !== "function")
    throw new Error("Flow debt writer operation must be a function.");
  if (onLocked !== undefined && typeof onLocked !== "function")
    throw new Error("Flow debt writer onLocked seam must be a function.");

  const lock = `${destination.target}${LOCK_SUFFIX}`;
  let lockDescriptor;
  try {
    lockDescriptor = fs.openSync(lock, "wx", 0o600);
  } catch (error) {
    if (error?.code === "EEXIST")
      throw new Error("Flow debt writer is already locked.");
    throw error;
  }

  try {
    writeAll(lockDescriptor, Buffer.from(`${process.pid}\n`));
    onLocked?.({ target: destination.target });
    return operation({
      target: destination.target,
      write: (bytes, options) => writeLocked(destination, bytes, options),
    });
  } finally {
    fs.closeSync(lockDescriptor);
    removeOwned(lock);
  }
}

/**
 * Atomically replace target with bytes and verify the exact resulting bytes.
 * Test seams observe bytes or rename paths but cannot replace writer operations.
 */
export function writeAtomicFlowDebtFile({ target, bytes }, options = {}) {
  return withFlowDebtWriteLock(
    { target },
    ({ write }) => write(bytes, options),
    { onLocked: options.onLocked },
  );
}
