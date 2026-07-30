import fs from "node:fs";
import path from "node:path";

export const MAX_DRAFTING_COMMITS = 20;
export const MAX_COMMIT_SUBJECT_BYTES = 512;
export const MAX_COMMIT_BODY_BYTES = 32 * 1024;
export const MAX_TEMPLATE_BYTES = 32 * 1024;
export const MAX_TEMPLATE_CANDIDATES = 20;

const SUBJECT = /^([a-z][a-z0-9-]*)(?:\(([^()\r\n]+)\))?(!)?: (?=.*\S)(.+)$/;
const SINGLE_TEMPLATES = [
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/pull_request_template.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
  "docs/pull_request_template.md",
  "PULL_REQUEST_TEMPLATE.md",
  "pull_request_template.md",
];
const TEMPLATE_DIRECTORIES = [
  ".github/PULL_REQUEST_TEMPLATE",
  ".github/pull_request_template",
  "docs/PULL_REQUEST_TEMPLATE",
  "docs/pull_request_template",
  "PULL_REQUEST_TEMPLATE",
  "pull_request_template",
];

function bounded(value, maxBytes) {
  const text = String(value || "");
  return Buffer.byteLength(text) <= maxBytes ? text : null;
}

export function parseConventionalSubject(subject) {
  const exact = bounded(subject, MAX_COMMIT_SUBJECT_BYTES);
  if (!exact) return null;
  const match = SUBJECT.exec(exact);
  if (!match) return null;
  return { subject: exact, type: match[1], scope: match[2] ?? null, breaking: Boolean(match[3]), outcome: match[4] };
}

export function hasBreakingFooter(body) {
  const exact = bounded(body, MAX_COMMIT_BODY_BYTES);
  if (exact === null) return false;
  const lines = exact.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^BREAKING(?: CHANGE|-CHANGE):[ \t]+\S/.test(lines[index])) continue;
    const startsContent = lines.slice(0, index).every((line) => !line.trim());
    if (!startsContent && lines[index - 1].trim()) continue;
    const remainder = lines.slice(index + 1).filter((line) => line.trim());
    if (remainder.every((line) => /^[ \t]+\S/.test(line) || /^[A-Za-z][A-Za-z0-9-]*(?: [A-Za-z][A-Za-z0-9-]*)?:[ \t]+\S/.test(line))) return true;
  }
  return false;
}

export function commitDraftingHints(commits, options = {}) {
  const boundedCommits = commits.slice(0, MAX_DRAFTING_COMMITS);
  const parsed = boundedCommits.map(({ subject }) => parseConventionalSubject(subject));
  const valid = parsed.filter(Boolean);
  const types = [...new Set(valid.map(({ type }) => type))].sort();
  const scopes = [...new Set(valid.map(({ scope }) => scope))].sort((left, right) => String(left).localeCompare(String(right)));
  const outcomes = [...new Set(valid.map(({ outcome }) => outcome))];
  const allValid = valid.length === boundedCommits.length && valid.length > 0;
  const commonType = types.length === 1 ? types[0] : null;
  const commonScope = scopes.length === 1 ? scopes[0] : null;
  const breaking = valid.some(({ breaking: marked }) => marked) || boundedCommits.some(({ body }) => hasBreakingFooter(body));
  let suggestedTitle = null;
  if (allValid && valid.length === 1) suggestedTitle = valid[0].subject;
  else if (allValid && commonType && outcomes.length === 1) {
    const scope = scopes.length === 1 && commonScope !== null ? `(${commonScope})` : "";
    const marker = valid.some(({ breaking: marked }) => marked) ? "!" : "";
    suggestedTitle = `${commonType}${scope}${marker}: ${outcomes[0]}`;
  }
  return {
    commitCount: Number.isSafeInteger(options.commitCount) ? options.commitCount : commits.length,
    analyzedCommitCount: boundedCommits.length,
    truncated: (Number.isSafeInteger(options.commitCount) ? options.commitCount : commits.length) > boundedCommits.length,
    validCommitCount: valid.length,
    invalidCommitCount: boundedCommits.length - valid.length,
    types,
    scopes,
    commonType,
    commonScope: scopes.length === 1 ? commonScope : null,
    breaking,
    suggestedTitle,
  };
}

function relativeName(root, entry) {
  return path.relative(root, entry).split(path.sep).join("/");
}

function inside(root, entry) {
  const relative = path.relative(root, entry);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function inspectTemplate(root, entry) {
  const candidate = relativeName(root, entry);
  try {
    const stat = fs.lstatSync(entry);
    if (stat.isSymbolicLink()) return { candidate, unavailable: "symlink" };
    if (!stat.isFile()) return { candidate, unavailable: "not-regular" };
    const canonical = fs.realpathSync(entry);
    if (!inside(root, canonical)) return { candidate, unavailable: "escaped" };
    if (canonical !== path.resolve(entry)) return { candidate, unavailable: "symlink" };
    if (stat.size > MAX_TEMPLATE_BYTES) return { candidate, unavailable: "oversized" };
    const content = fs.readFileSync(canonical);
    if (content.length > MAX_TEMPLATE_BYTES) return { candidate, unavailable: "oversized" };
    return { candidate, bytes: content.length, content: content.toString("utf8") };
  } catch {
    return { candidate, unavailable: "unreadable" };
  }
}

export function discoverPrTemplate(repoRoot) {
  let root;
  try {
    root = fs.realpathSync(repoRoot);
    if (!fs.lstatSync(root).isDirectory()) return { status: "unavailable", candidates: [], reason: "root-unavailable" };
  } catch {
    return { status: "unavailable", candidates: [], reason: "root-unavailable" };
  }

  const entries = []; const seen = new Set();
  const addEntry = (entry) => {
    const key = process.platform === "win32" ? path.resolve(entry).toLowerCase() : path.resolve(entry);
    if (!seen.has(key)) { seen.add(key); entries.push(entry); }
  };
  for (const relative of SINGLE_TEMPLATES) {
    const entry = path.join(root, ...relative.split("/"));
    try { fs.lstatSync(entry); addEntry(entry); } catch {}
  }
  for (const relative of TEMPLATE_DIRECTORIES) {
    const directory = path.join(root, ...relative.split("/"));
    try {
      const stat = fs.lstatSync(directory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) { addEntry(directory); continue; }
      for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
        if (item.name.toLowerCase().endsWith(".md")) addEntry(path.join(directory, item.name));
      }
    } catch (error) { if (error.code !== "ENOENT") addEntry(directory); }
  }

  const totalCandidates = entries.length;
  const inspected = entries.slice(0, MAX_TEMPLATE_CANDIDATES).map((entry) => inspectTemplate(root, entry));
  const candidates = inspected.map(({ candidate }) => candidate);
  if (totalCandidates === 0) return { status: "none" };
  if (totalCandidates > 1) return { status: "ambiguous", candidates, truncated: totalCandidates > inspected.length };
  const [template] = inspected;
  if (template.unavailable) return { status: "unavailable", candidates, reason: template.unavailable };
  return { status: "available", path: template.candidate, bytes: template.bytes, content: template.content };
}
