import { createImageProcessingWorker, createSearchIndexWorker } from "@/jobs/workers";
import { logger } from "@/lib/logger";

// Standalone entrypoint for the background-worker process. Runs separately
// from the Next.js app (its own container/dyno in production) since BullMQ
// workers are long-lived and don't fit a serverless request/response model.
const workers = [createImageProcessingWorker(), createSearchIndexWorker()];

logger.info("Workers started", { queues: ["image-processing", "search-indexing"] });

async function shutdown() {
  logger.info("Workers shutting down");
  await Promise.all(workers.map((worker) => worker.close()));
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
