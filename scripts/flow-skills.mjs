#!/usr/bin/env node

process.stderr.write(
  "flow-skills sync is retired. It never mutates a host. " +
    "Maintainers may use the repository-local explicit reconciliation preview instead.\n",
);
process.exitCode = 1;
