export function buildDotnetFormatExecution(target, changedPaths = null) {
  if (!target) return null;
  const files = changedPaths == null
    ? null
    : changedPaths.filter((file) => String(file).toLowerCase().endsWith(".cs"));
  if (files && files.length === 0) return null;
  const args = ["format", String(target).replace(/^"|"$/g, ""), "--verify-no-changes"];
  if (files) args.push("--include", ...files);
  return {
    file: "dotnet",
    args,
    command: ["dotnet", ...args].map((value) => JSON.stringify(value)).join(" "),
  };
}
