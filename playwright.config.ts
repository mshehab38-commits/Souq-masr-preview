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
  // on-demand compile cost for each one inside a single test. Raised once
  // already (to 60s, Phase 10); still observed hitting the ceiling in
  // Phase 13 at ~48-60s on this sandbox's slower runs, confirmed genuinely
  // slow rather than hung (passed cleanly at 48.3s with more headroom) —
  // raised again with real margin rather than chasing the exact number.
  timeout: 90_000,
  // Separate from the 60s test timeout above: this is the ceiling on each
  // individual `expect(...).toBeVisible()`-style assertion, and Playwright's
  // own default (5s) is what every intermittent admin-page failure in this
  // sandbox actually hit — not the overall test timeout. An admin page's
  // client component (e.g. ReportsQueue, PendingReviewQueue) fetches its
  // own data after mount; on a cold `next dev` compile of that route plus
  // its API route, that fetch can take longer than 5s even though the test
  // as a whole has plenty of budget left. Confirmed via the failure
  // snapshots: the page was mid "جارٍ التحميل..." (loading), not stuck or
  // broken, at the moment the assertion gave up.
  expect: {
    timeout: 15_000,
  },
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
