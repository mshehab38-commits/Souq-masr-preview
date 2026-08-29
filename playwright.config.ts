import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// This sandbox ships a pre-installed Chromium outside Playwright's usual
// managed-browser cache; everywhere else (CI, other dev machines) falls
// back to Playwright's own browser discovery.
const sandboxChromium = "/opt/pw-browsers/chromium";
const executablePath = existsSync(sandboxChromium) ? sandboxChromium : undefined;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Sequential: all specs share one dev-server instance and one Postgres/
  // Redis instance, so parallel workers cause on-demand route-compilation
  // contention (and would race on shared DB state) rather than genuine
  // isolation. The suite is small enough that this costs little.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // Default (30s) is too tight here: a spec that's first to hit several
  // distinct routes (e.g. store-management-flow touching /dashboard/store,
  // /store/[slug], /listings/mine, /api/listings/bulk) pays Next.js's
  // on-demand compile cost for each one inside a single test — observed
  // taking ~30s total on this sandbox even though every individual step is
  // fast, causing an intermittent timeout that isn't a real hang.
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
