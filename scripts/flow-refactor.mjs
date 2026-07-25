#!/usr/bin/env node
/**
 * flow-refactor.mjs — Read-only scope/context resolver for /flow-refactor.
 * It never runs project checks and never writes files.
 */

import process from "process";
import { parseArgs } from "./lib/helpers.mjs";
import { getScopeInfo } from "./lib/scope.mjs";

const flags = parseArgs();

if ("module" in flags && !("scope" in flags)) {
  flags.scope = flags.module;
}

const scope = getScopeInfo(flags);

process.stdout.write(
  JSON.stringify(
    {
      mode: "refactor",
      scope,
      nextAction: "llm-refactor-review",
    },
    null,
    2,
  ) + "\n",
);
