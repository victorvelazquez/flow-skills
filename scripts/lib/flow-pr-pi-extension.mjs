import { identity } from "./flow-pr-contracts.mjs";

const INTENT_FIELDS = [
  "body",
  "deliveryMode",
  "draft",
  "labels",
  "push",
  "schema",
  "title",
  "updateExisting",
];
const DRAFT_FIELDS = ["body", "draft", "title"];

function asObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value;
}

function oneLine(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function list(value) {
  return Array.isArray(value)
    ? value
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map(oneLine)
    : [];
}

function changedPaths(context) {
  return list(context?.changes?.files).slice(0, 12);
}

function commitSubjects(context) {
  return list(context?.changes?.commits).slice(0, 8);
}

function titleFromContext(context) {
  const suggested = oneLine(context?.changes?.drafting?.suggestedTitle);
  if (suggested) return suggested;
  const [subject] = commitSubjects(context);
  if (subject) return subject;
  const branch = oneLine(context?.branch);
  return branch ? `Update ${branch}` : "Prepare Flow PR publication";
}

function genericBody(context) {
  const commits = commitSubjects(context);
  const paths = changedPaths(context);
  const lines = ["## Summary", ""];
  if (commits.length) lines.push(...commits.map((item) => `- ${item}`));
  else lines.push("- Publish the verified task branch changes.");
  lines.push("", "## Changes", "");
  if (paths.length) lines.push(...paths.map((item) => `- ${item}`));
  else
    lines.push(
      "- No changed-path summary was available from the preparation context.",
    );
  lines.push("", "## Validation", "", "- Not provided");
  return `${lines.join("\n")}\n`;
}

export function buildSemanticDraft(context, existingDraft = false) {
  if (typeof existingDraft !== "boolean")
    throw new Error("Flow PR intent draft default is invalid.");
  return {
    title: titleFromContext(context),
    // Raw PR templates can assert unchecked validation; never publish them verbatim.
    body: genericBody(context),
    draft: existingDraft,
  };
}

function replaceJsonLine(source, key, value) {
  const encoded = JSON.stringify(value);
  const pattern = new RegExp(`^(\\s*)"${key}"\\s*:\\s*.*?(,?)$`, "m");
  if (!pattern.test(source))
    throw new Error(`Intent template is missing ${key}.`);
  return source.replace(pattern, `$1"${key}": ${encoded}$2`);
}

export function materializeIntent(templateText, draft) {
  let intent;
  try {
    intent = JSON.parse(templateText);
  } catch {
    throw new Error("Flow PR intent template is invalid JSON.");
  }
  const intentObject = asObject(intent, "Intent template");
  const draftObject = asObject(draft, "Draft");
  const intentKeys = Object.keys(intentObject).sort();
  if (intentKeys.join("\0") !== INTENT_FIELDS.join("\0"))
    throw new Error(`Unexpected intent field set: ${intentKeys.join(", ")}`);
  for (const key of Object.keys(draftObject))
    if (!DRAFT_FIELDS.includes(key))
      throw new Error(`Unsupported draft field: ${key}`);
  if (intentObject.schema !== "flow-pr/intent-v2")
    throw new Error("Unsupported intent schema.");
  if (typeof draftObject.title !== "string" || !draftObject.title.trim())
    throw new Error("Draft title is required.");
  if (typeof draftObject.body !== "string" || !draftObject.body.trim())
    throw new Error("Draft body is required.");
  if (Buffer.byteLength(draftObject.title, "utf8") > 512)
    throw new Error("Draft title is too large.");
  if (Buffer.byteLength(draftObject.body, "utf8") > 64 * 1024)
    throw new Error("Draft body is too large.");
  if (typeof draftObject.draft !== "boolean")
    throw new Error("Draft flag must be boolean.");

  let next = String(templateText);
  next = replaceJsonLine(next, "title", draftObject.title);
  next = replaceJsonLine(next, "body", draftObject.body);
  next = replaceJsonLine(next, "draft", draftObject.draft);
  try {
    JSON.parse(next);
  } catch {
    throw new Error(
      "Flow PR semantic intent materialization produced invalid JSON.",
    );
  }
  return next.endsWith("\n") ? next : `${next}\n`;
}

function splitCommandArgs(value) {
  const args = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(value || ""))))
    args.push(match[1] ?? match[2] ?? match[3]);
  return args;
}

export function prepareArgs(argsText = "") {
  const tokens = splitCommandArgs(argsText);
  const args = ["--prepare"];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (["--base", "--push-remote"].includes(token) && tokens[index + 1]) {
      args.push(token, tokens[index + 1]);
      index += 1;
    } else if (token.trim()) {
      throw new Error(`Unsupported /flow-pr argument: ${token}`);
    }
  }
  return args;
}

export class FlowPrRuntimeError extends Error {
  constructor(phase, envelope) {
    super(runtimeEnvelopeMessage(phase, envelope));
    this.name = "FlowPrRuntimeError";
    this.phase = phase;
    this.envelope = envelope;
  }
}

function bounded(value, max = 512) {
  const text = oneLine(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function runtimeEnvelopeMessage(phase, envelope) {
  const status = bounded(envelope?.status || "unknown");
  const classification = bounded(
    envelope?.error?.diagnostics?.classification ||
      envelope?.error?.classification ||
      "",
  );
  const recovery = envelope?.recovery || envelope?.error?.recovery;
  const recoveryCode = bounded(recovery?.code || "");
  const recoveryMessage = bounded(recovery?.message || "");
  return [
    `Flow PR ${phase} returned ${status}.`,
    classification ? `Diagnostic: ${classification}.` : "",
    recoveryCode ? `Recovery code: ${recoveryCode}.` : "",
    recoveryMessage ? `Recovery: ${recoveryMessage}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function parseJsonLine(result, phase) {
  const stdout = String(result?.stdout || "").trim();
  const last = stdout.split(/\r?\n/).filter(Boolean).at(-1);
  if (!last) throw new Error(`Flow PR ${phase} returned no JSON output.`);
  let value;
  try {
    value = JSON.parse(last);
  } catch {
    throw new Error(`Flow PR ${phase} returned invalid JSON.`);
  }
  if (typeof result?.code === "number" && result.code !== 0) {
    throw new FlowPrRuntimeError(phase, value);
  }
  return value;
}

function assertPreparedContext(value) {
  if (
    value?.schema !== "flow-pr/prepare-context-v2" ||
    value.status !== "prepared" ||
    value.phase !== "prepare" ||
    typeof value.handle !== "string" ||
    typeof value.intentPath !== "string" ||
    !value.context
  ) {
    throw new FlowPrRuntimeError("prepare", value);
  }
}

function assertPreparedRequest(value) {
  if (
    value?.schema !== "flow-pr/preparation-v2" ||
    value.status !== "prepared" ||
    value.phase !== "prepare" ||
    typeof value.handle !== "string"
  ) {
    throw new FlowPrRuntimeError("finalize", value);
  }
}

function assertVerifiedResult(value) {
  if (
    value?.schema !== "flow-pr/result-v1" ||
    !["success", "noop"].includes(value.status) ||
    value.phase !== "verify" ||
    !value.pr?.url
  ) {
    throw new FlowPrRuntimeError("execute", value);
  }
}

function formatStatus(result) {
  return `Flow PR ${result.status}: ${result.pr.url}`;
}

function displayLine(value) {
  return String(value)
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function approvalMessage(value, body) {
  const approval = asObject(value, "Finalized approval");
  const fields = {
    repository: approval.repository,
    branchToBase: approval.branchToBase,
    baseAuthority: approval.baseAuthority,
    action: approval.action,
    title: approval.title,
    body: approval.body,
    draft: approval.draft,
    labels: approval.labels,
    authorizedUpdateFields: approval.authorizedUpdateFields,
    delivery: approval.delivery,
  };
  if (
    ![fields.repository, fields.branchToBase, fields.title].every(
      (field) => typeof field === "string" && field.length > 0,
    ) ||
    typeof fields.draft !== "boolean" ||
    !Number.isSafeInteger(fields.body?.bytes) ||
    fields.body.bytes < 0 ||
    !/^[0-9a-f]{64}$/.test(fields.body?.sha256) ||
    ![
      fields.baseAuthority,
      fields.action,
      fields.labels,
      fields.delivery,
    ].every(
      (field) => field && typeof field === "object" && !Array.isArray(field),
    ) ||
    !Array.isArray(fields.authorizedUpdateFields) ||
    ![
      fields.baseAuthority.source,
      fields.baseAuthority.evidence,
      fields.action.git,
      fields.action.pullRequest,
      fields.action.expectation,
      fields.delivery.mode,
      fields.delivery.target,
      fields.delivery.pushRemote,
      fields.delivery.pushRepository,
    ].every((field) => typeof field === "string" && field.length > 0) ||
    ![fields.labels.add, fields.labels.remove].every(Array.isArray) ||
    ![
      ...fields.labels.add,
      ...fields.labels.remove,
      ...fields.authorizedUpdateFields,
    ].every((field) => typeof field === "string")
  )
    throw new Error("Flow PR finalized approval summary is incomplete.");
  if (
    typeof body !== "string" ||
    fields.body.bytes !== Buffer.byteLength(body, "utf8") ||
    fields.body.sha256 !== identity(body)
  )
    throw new Error("Flow PR finalized body differs from the prepared draft.");
  if (
    !["create", "update", "noop"].includes(fields.action.pullRequest) ||
    !["push", "verify"].includes(fields.action.git) ||
    !["same-repo", "fork"].includes(fields.delivery.mode)
  )
    throw new Error("Flow PR finalized approval action is invalid.");
  const prAction = {
    create: "Create PR",
    update: "Update PR",
    noop: "No PR change",
  }[fields.action.pullRequest];
  const lines = [
    `Repository: ${displayLine(fields.repository)}`,
    `Branch: ${displayLine(fields.branchToBase)}`,
    `Action: ${prAction}; ${fields.action.git} via ${displayLine(fields.delivery.pushRemote)}`,
    `Delivery: ${displayLine(fields.delivery.mode)} to ${displayLine(fields.delivery.target)} (push repository: ${displayLine(fields.delivery.pushRepository)})`,
    `Title: ${displayLine(fields.title)}`,
    `Draft: ${fields.draft ? "Yes" : "No"}`,
  ];
  if (fields.labels.add.length || fields.labels.remove.length)
    lines.push(
      `Labels: ${fields.labels.add.map((label) => `+${displayLine(label)}`).join(", ") || "none added"}; ${fields.labels.remove.map((label) => `-${displayLine(label)}`).join(", ") || "none removed"}`,
    );
  if (fields.action.pullRequest === "update")
    lines.push(
      `Update fields: ${fields.authorizedUpdateFields.map(displayLine).join(", ")}`,
    );
  lines.push(
    `Base authority: ${displayLine(fields.baseAuthority.source)} (${displayLine(fields.baseAuthority.evidence)})`,
  );
  const preview = body
    .replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  lines.push(
    `Body: ${fields.body.bytes} bytes; SHA-256 ${fields.body.sha256}; preview: ${preview.slice(0, 240)}${preview.length > 240 ? "…" : ""}`,
  );
  const message = lines.join("\n");
  if (Buffer.byteLength(message, "utf8") > 8192)
    throw new Error("Flow PR finalized approval summary is too large.");
  return message;
}

const safeFact = (value, max = 256) =>
  typeof value === "string" &&
  Buffer.byteLength(value) <= max &&
  !/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069`<>]/.test(value)
    ? value
    : null;

export function verifiedProjection(result) {
  if (
    result?.schema !== "flow-pr/result-v1" ||
    !["success", "noop"].includes(result.status) ||
    result.phase !== "verify" ||
    !safeFact(result.pr?.url, 2048) ||
    !/^https:\/\/[^\s]+$/.test(result.pr.url)
  )
    return null;
  const statusOnly = {
    schema: result.schema,
    status: result.status,
    phase: result.phase,
    pr: { url: result.pr.url },
    publication: null,
  };
  const publication = result.publication;
  const candidate = publication?.candidate;
  if (
    !publication ||
    !candidate ||
    candidate.truncated !== false ||
    !Array.isArray(candidate.changedPaths) ||
    candidate.changedPaths.length > 20 ||
    !Array.isArray(candidate.commitSubjects) ||
    candidate.commitSubjects.length > 10 ||
    !Number.isSafeInteger(candidate.commitCount) ||
    candidate.commitCount < 0 ||
    ![publication.repository, publication.branch, publication.base].every((x) =>
      safeFact(x),
    ) ||
    ![
      publication.baseOid,
      publication.headOid,
      candidate.baseOid,
      candidate.headOid,
    ].every((x) => /^[a-f0-9]{40}$/.test(x)) ||
    candidate.baseOid !== publication.baseOid ||
    candidate.headOid !== publication.headOid ||
    ![...candidate.changedPaths, ...candidate.commitSubjects].every((x) =>
      safeFact(x),
    )
  )
    return statusOnly;
  return {
    ...statusOnly,
    publication: {
      repository: publication.repository,
      branch: publication.branch,
      base: publication.base,
      baseOid: publication.baseOid,
      headOid: publication.headOid,
      candidate: {
        baseOid: candidate.baseOid,
        headOid: candidate.headOid,
        commitCount: candidate.commitCount,
        truncated: false,
        changedPaths: candidate.changedPaths,
        commitSubjects: candidate.commitSubjects,
      },
    },
  };
}

export async function directFlowPr(argsText = "", deps) {
  if (deps.mode !== "tui")
    throw new Error(
      "/flow-pr publication confirmation is available only in interactive Pi TUI mode.",
    );
  const runtimePath = deps.runtimePath;
  if (!runtimePath) throw new Error("Flow PR runtime path is required.");
  let executed = false;
  const execNode = async (args) =>
    deps.exec("node", [runtimePath, ...args], {
      cwd: deps.cwd,
      signal: deps.signal,
    });

  const prepared = parseJsonLine(
    await execNode(prepareArgs(argsText)),
    "prepare",
  );
  assertPreparedContext(prepared);

  const templateText = await deps.readFile(prepared.intentPath);
  let template;
  try {
    template = JSON.parse(templateText);
  } catch {
    throw new Error("Flow PR intent template is invalid JSON.");
  }
  const draft = buildSemanticDraft(prepared.context, template?.draft);
  await deps.writeFile(
    prepared.intentPath,
    materializeIntent(templateText, {
      title: draft.title,
      body: draft.body,
      draft: draft.draft,
    }),
  );

  const finalized = parseJsonLine(
    await execNode(["--prepare", "--handle", prepared.handle]),
    "finalize",
  );
  assertPreparedRequest(finalized);
  const message = approvalMessage(finalized.approval, draft.body);
  if (typeof deps.confirm !== "function")
    throw new Error(
      "Flow PR approval UI is unavailable; no publication executed.",
    );
  if ((await deps.confirm("Publish Flow PR?", message)) !== true)
    throw new Error("Flow PR approval declined; no publication executed.");
  if (executed)
    throw new Error("Flow PR command attempted more than one execution.");
  executed = true;
  const result = parseJsonLine(
    await execNode(["--execute", "--handle", finalized.handle]),
    "execute",
  );
  assertVerifiedResult(result);
  return {
    prepared,
    finalized,
    result,
    text: formatStatus(result),
    executed,
  };
}
