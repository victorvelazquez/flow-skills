import { spawn } from "node:child_process";

export const FLOW_AUDIT_PROCESS_GRACE_MS = 500;

function waitForChildExit(child, graceMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), graceMs);
    const complete = () => { clearTimeout(timer); resolve(true); };
    child.once?.("close", complete);
    child.once?.("error", complete);
  });
}

export async function terminateProcessTree(child, {
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  waitForExit = waitForChildExit,
  graceMs = FLOW_AUDIT_PROCESS_GRACE_MS,
  waitForKiller = waitForChildExit,
} = {}) {
  if (!child?.pid) return;
  if (platform === "win32") {
    try {
      const killer = spawnProcess("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      const exited = await waitForKiller(killer, graceMs);
      if (exited && killer.exitCode === 0) return;
      child.kill?.();
      return;
    } catch {
      child.kill?.();
      return;
    }
  }
  try {
    killProcess(-child.pid, "SIGTERM");
  } catch {
    child.kill?.("SIGTERM");
  }
  if (await waitForExit(child, graceMs)) return;
  try {
    killProcess(-child.pid, "SIGKILL");
  } catch {
    child.kill?.("SIGKILL");
  }
}
