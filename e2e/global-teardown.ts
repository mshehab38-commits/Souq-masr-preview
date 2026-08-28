import { readFileSync, rmSync } from "node:fs";
import path from "node:path";

const PID_FILE = path.join(__dirname, ".worker-pid");

export default async function globalTeardown() {
  try {
    const pid = Number(readFileSync(PID_FILE, "utf8"));
    // Negative PID targets the whole detached process group (npm's spawned
    // shell + the tsx child it launches), not just the npm wrapper itself.
    process.kill(-pid, "SIGTERM");
  } catch {
    // Worker was never started or already exited — nothing to clean up.
  } finally {
    rmSync(PID_FILE, { force: true });
  }
}
