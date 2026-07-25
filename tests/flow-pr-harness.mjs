import { createHash } from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import { auto, configurePublicationTestDependencies, finalizeChainTracker, preparePromotion, promotionReview, publishPromotion } from "../scripts/flow-pr.mjs";
import { runFileSafe } from "../scripts/lib/helpers.mjs";

const identity = (file) => {
  const resolved = fs.realpathSync.native(file).replace(/\\/g, "/");
  const canonical = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return { path: canonical, digest: createHash("sha256").update(fs.readFileSync(canonical)).digest("hex") };
};
const tooling = {
  gentle: identity(process.env.TEST_GENTLE_AI_SCRIPT),
  audit: identity(process.env.TEST_AUDIT_SCRIPT),
};
const runner = (command, args, options) => {
  if (command === tooling.gentle.path || command === "gentle-ai") return runFileSafe(process.execPath, [tooling.gentle.path, ...args], options);
  if (command === process.execPath && args[0] === tooling.audit.path) return runFileSafe(process.execPath, args, options);
  if (command === "gh") return runFileSafe(process.execPath, [process.env.TEST_GH_SCRIPT, ...args], options);
  return runFileSafe(command, args, options);
};

configurePublicationTestDependencies({ runner, tooling });
try {
  const autoIndex = process.argv.indexOf("--auto");
  if (autoIndex !== -1) {
    const flags = { auto: true };
    for (let index = autoIndex + 1; index < process.argv.length; index++) {
      const key = process.argv[index].replace(/^--/, "");
      const next = process.argv[index + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        index++;
      } else flags[key] = true;
    }
    auto(flags);
  } else if (process.argv.includes("--promotion-review") || process.argv.includes("--prepare-promotion")) {
    const flags = {};
    for (let index = 2; index < process.argv.length; index++) {
      const key = process.argv[index].replace(/^--/, ""), next = process.argv[index + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; index++; } else flags[key] = true;
    }
    if (flags["prepare-promotion"]) preparePromotion(flags); else promotionReview(flags);
  } else if (process.argv.includes("--finalize-chain-tracker")) {
    const flags = {};
    for (let index = 2; index < process.argv.length; index++) {
      const key = process.argv[index].replace(/^--/, ""), next = process.argv[index + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; index++; } else flags[key] = true;
    }
    finalizeChainTracker(flags);
  } else {
    const flags = {};
    for (let index = 2; index < process.argv.length; index++) {
      const key = process.argv[index].replace(/^--/, ""), next = process.argv[index + 1];
      if (next && !next.startsWith("--")) { flags[key] = next; index++; } else flags[key] = true;
    }
    publishPromotion(flags);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
