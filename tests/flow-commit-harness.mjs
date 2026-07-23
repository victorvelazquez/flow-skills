import process from "node:process";

import { autoCommitWorkflow, configureCommitTestDependencies } from "../scripts/flow-commit.mjs";
import { runFileSafe } from "../scripts/lib/helpers.mjs";

const runner = (command, args, options) => {
  if (command === "gentle-ai") {
    return runFileSafe(process.execPath, [process.env.TEST_GENTLE_AI_SCRIPT, ...args], options);
  }
  return runFileSafe(command, args, options);
};

configureCommitTestDependencies({ runner });
const flags = {};
for (let index = 2; index < process.argv.length; index++) {
  const key = process.argv[index].replace(/^--/, "");
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    flags[key] = next;
    index++;
  } else flags[key] = true;
}

try {
  autoCommitWorkflow(flags);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
