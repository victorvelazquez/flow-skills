export const MANAGED_START = "<!-- flow-pr:managed:start -->";
export const MANAGED_END = "<!-- flow-pr:managed:end -->";
export const HUMAN_START = "<!-- flow-pr:human:start -->";
export const HUMAN_END = "<!-- flow-pr:human:end -->";

function markerPositions(body, marker) {
  const positions = [];
  let cursor = 0;
  while (true) { const index = body.indexOf(marker, cursor); if (index < 0) return positions; positions.push(index); cursor = index + marker.length; }
}

export function validatePrBodyMarkers(body) {
  const text = String(body || "");
  const managedStart = markerPositions(text, MANAGED_START), managedEnd = markerPositions(text, MANAGED_END), humanStart = markerPositions(text, HUMAN_START), humanEnd = markerPositions(text, HUMAN_END);
  for (const [name, starts, ends] of [["managed", managedStart, managedEnd], ["human", humanStart, humanEnd]]) {
    if (starts.length > 1 || ends.length > 1) throw new Error(`Invalid PR body: duplicate ${name} markers.`);
    if (starts.length !== ends.length) throw new Error(`Invalid PR body: incomplete ${name} markers.`);
    if (starts.length === 1 && starts[0] >= ends[0]) throw new Error(`Invalid PR body: out-of-order ${name} markers.`);
  }
  if (managedStart.length === 1 && humanStart.length === 1 && !(managedEnd[0] < humanStart[0] || humanEnd[0] < managedStart[0])) throw new Error("Invalid PR body: managed and human markers overlap.");
  return { hasManaged: managedStart.length === 1, hasHuman: humanStart.length === 1, managedStart: managedStart[0] ?? -1, managedEnd: managedEnd[0] ?? -1 };
}

function section(title, content) { return !content || (Array.isArray(content) && content.length === 0) ? null : `## ${title}\n${Array.isArray(content) ? content.join("\n") : content}`; }

export function buildManagedPrBody(data) {
  const validation = data.validationEvidence || { status: "Not recorded", details: [] };
  const sections = [section("Summary", data.summary), section("Review path", `1. ${data.reviewPath || "Review the outcome and behavior changes first."}\n2. Out of scope: ${data.outOfScope || "No additional scope declared."}`), section("Chain Control Plane", data.controlPlane), section("Chain Context", data.chainContext), section("Changes by outcome", data.changes), section("Breaking changes", data.breakingChanges), section("Validation evidence", `<details>\n<summary>${validation.status}</summary>\n\n${(validation.details || []).map((item) => `- ${item}`).join("\n")}\n</details>`), section("Delivery and risk notes", data.deliveryNotes), section("Checklist", `### Automated\n- [x] Branch, base, and candidate scope resolved by Flow\n- [${validation.status === "Passed" ? "x" : " "}] Check evidence is current and passed\n\n### Reviewer\n- [ ] Outcome and scope match the stated summary\n- [ ] Validation and delivery risks are acceptable`)].filter(Boolean);
  return `${MANAGED_START}\n${sections.join("\n\n")}\n${MANAGED_END}`;
}

export function mergePrBody(existingBody, managedBlock, options = {}) {
  const existing = String(existingBody || "");
  const state = validatePrBodyMarkers(existing);
  if (state.hasManaged) return existing.slice(0, state.managedStart) + managedBlock + existing.slice(state.managedEnd + MANAGED_END.length);
  const preserved = String(options.humanContent ?? existing);
  return `${managedBlock}\n\n${HUMAN_START}\n${preserved}${preserved.endsWith("\n") || !preserved ? "" : "\n"}${HUMAN_END}`;
}
