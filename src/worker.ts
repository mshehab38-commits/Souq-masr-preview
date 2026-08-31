import {
  createImageProcessingWorker,
  createSearchIndexWorker,
  createListingExpiryWorker,
  createListingImageSweepWorker,
  createAuthRowPruneWorker,
} from "@/jobs/workers";
import { logger } from "@/lib/logger";

// Standalone entrypoint for the background-worker process. Runs separately
// from the Next.js app (its own container/dyno in production) since BullMQ
// workers are long-lived and don't fit a serverless request/response model.
//
// Wrapped in an async function rather than using top-level await: tsx
// transpiles this entrypoint to CJS (no "type": "module" in package.json),
// and esbuild's CJS output doesn't support top-level await — it throws at
// startup instead of running. Since global-setup.ts spawns this process with
// stdio: "ignore", that crash was otherwise silent: e2e tests needing the
// image-processing worker would just time out waiting for a job that never
// ran, with nothing in the test output pointing at the actual cause.
async function main() {
  const workers = [
    createImageProcessingWorker(),
    createSearchIndexWorker(),
    await createListingExpiryWorker(),
    await createListingImageSweepWorker(),
    await createAuthRowPruneWorker(),
  ];

  logger.info("Workers started", {
    queues: [
      "image-processing",
      "search-indexing",
      "listing-expiry",
      "listing-image-sweep",
      "auth-row-prune",
    ],
  });

  async function shutdown() {
    logger.info("Workers shutting down");
    await Promise.all(workers.map((worker) => worker.close()));
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((error) => {
  logger.error("Worker process failed to start", { error: (error as Error).message });
  process.exit(1);
});
