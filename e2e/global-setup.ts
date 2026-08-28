import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";

const PID_FILE = path.join(__dirname, ".worker-pid");

export default async function globalSetup() {
  const workerProcess = spawn("npm", ["run", "worker"], {
    stdio: "ignore",
    detached: true,
  });
  workerProcess.unref();
  if (workerProcess.pid) {
    writeFileSync(PID_FILE, String(workerProcess.pid));
  }
  // Give the worker a moment to connect to Redis and register its queues.
  await new Promise((resolve) => setTimeout(resolve, 2000));
}
