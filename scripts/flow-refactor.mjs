#!/usr/bin/env node
/**
 * flow-refactor.mjs — Deterministic, read-only smell detection and draft output.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { normalizeDraft } from "../core/flow-debt-contract.mjs";
import { parseArgs } from "./lib/helpers.mjs";
import { getScopeInfo } from "./lib/scope.mjs";

const RULES = [
  {
    id: "debug-output",
    pattern: /\b(?:console\.(?:log|debug)\s*\(|debugger\b)/,
    summary: "Debug output is present.",
  },
  {
    id: "todo-marker",
    pattern: /\b(?:TODO|FIXME)\b/,
    summary: "A TODO marker is present.",
  },
];

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const portablePath = (value) =>
  /^[A-Za-z0-9._/-]+$/.test(value) &&
  !value.startsWith("/") &&
  value.split("/").every((part) => part && part !== "." && part !== "..");

function draftFor(finding) {
  const reference = `flow-refactor:${finding.rule}:${finding.path}:${finding.line}`;
  const todo = finding.rule === "todo-marker";
  return normalizeDraft({
    schema: "flow-debt-draft/v1",
    title: todo
      ? `Resolve TODO in ${finding.path}`
      : `Remove debug output from ${finding.path}`,
    problem: todo
      ? "A TODO marker is present in the reviewed source."
      : "Debug output is present in the reviewed source.",
    priority: "p2",
    severity: "medium",
    scope: [finding.path],
    acceptanceCriteria: [
      todo
        ? `Address or document the TODO at line ${finding.line}.`
        : `Remove the debug output at line ${finding.line}.`,
    ],
    verification: [
      todo
        ? `Read ${finding.path} and confirm the TODO is addressed or documented.`
        : `Read ${finding.path} and confirm the debug output is absent.`,
    ],
    producer: { kind: "flow-refactor", reference },
    evidence: [
      {
        reference: `${finding.path}:${finding.line}`,
        summary: finding.summary,
      },
    ],
  });
}

function findingsFor(file) {
  const source = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  return source.split(/\r?\n/).flatMap((line, index) =>
    RULES.filter(({ pattern }) => pattern.test(line)).map((rule) => ({
      rule: rule.id,
      path: file,
      line: index + 1,
      summary: rule.summary,
    })),
  );
}

const flags = parseArgs();
if ("module" in flags && !("scope" in flags)) flags.scope = flags.module;

const resolved = getScopeInfo(flags);
const files = [...new Set(resolved.files)]
  .map((file) => file.replaceAll("\\", "/"))
  .filter(portablePath)
  .sort(compare);
const scope = {
  ...resolved,
  files,
  modules: [...new Set(resolved.modules)].sort(compare),
};
const findings = files
  .flatMap((file) => {
    try {
      return findingsFor(file);
    } catch {
      return [];
    }
  })
  .sort(
    (left, right) =>
      compare(left.path, right.path) ||
      left.line - right.line ||
      compare(left.rule, right.rule),
  );
const drafts = findings.map(draftFor);
const clean = findings.length === 0;

process.stdout.write(
  `${JSON.stringify(
    {
      schema: "flow-refactor-report/v1",
      mode: "read-only",
      scope,
      status: clean ? "clean" : "findings",
      message: clean
        ? "No supported smells detected."
        : "Supported smells detected.",
      findings,
      drafts,
    },
    null,
    2,
  )}\n`,
);
