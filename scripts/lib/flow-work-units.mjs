function normalizedFeature(file) {
  return String(file.feature || "root").replace(/^\./, "").toLowerCase();
}

function isTransverseConfig(file) {
  return file.type === "config" && ["root", "config", "github"].includes(normalizedFeature(file));
}

export function groupWorkUnits(files) {
  const groups = new Map();
  const support = [];
  for (const file of files) {
    if (file.type === "source") {
      const scope = normalizedFeature(file);
      const key = `behavior:${scope}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    } else support.push(file);
  }
  const behaviorScopes = [...groups.keys()].map((key) => key.slice("behavior:".length));
  const ambiguities = [];
  for (const file of support) {
    const scope = normalizedFeature(file);
    const directKey = `behavior:${scope}`;
    if (groups.has(directKey) && !isTransverseConfig(file)) {
      groups.get(directKey).push(file);
      continue;
    }
    if (behaviorScopes.length === 1 && !isTransverseConfig(file)) {
      groups.get(`behavior:${behaviorScopes[0]}`).push(file);
      continue;
    }
    if (behaviorScopes.length > 1 && !isTransverseConfig(file) && ["root", "test", "tests", "docs", "doc"].includes(scope)) {
      ambiguities.push({ file: file.path, candidateGroups: behaviorScopes.map((candidate) => `behavior:${candidate}`) });
      continue;
    }
    const bucket = isTransverseConfig(file) ? "config" : file.type;
    const key = `${bucket}:${scope}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(file);
  }
  return { groups: [...groups.entries()].map(([key, groupFiles]) => ({ key, files: groupFiles })), ambiguities };
}
