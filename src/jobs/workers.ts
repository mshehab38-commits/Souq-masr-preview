import { Worker } from "bullmq";
import { queueRedis } from "@/lib/queue-redis";
import { logger } from "@/lib/logger";
import { processListingImage, type ImageProcessingJobData } from "./image-processing";
import { indexListingJob, type SearchIndexJobData } from "./search-indexing";
import { sweepExpiredListings } from "./listing-expiry";
import { sweepStuckListingImages } from "./listing-image-sweep";
import { pruneExpiredAuthRows } from "./auth-row-pruning";
import {
  listingExpiryQueue,
  LISTING_EXPIRY_SWEEP_INTERVAL_MS,
  listingImageSweepQueue,
  LISTING_IMAGE_SWEEP_INTERVAL_MS,
  authRowPruneQueue,
  AUTH_ROW_PRUNE_INTERVAL_MS,
} from "./queues";

export function createImageProcessingWorker(): Worker<ImageProcessingJobData> {
  const worker = new Worker<ImageProcessingJobData>(
    "image-processing",
    async (job) => processListingImage(job.data),
    { connection: queueRedis, concurrency: 4 },
  );

  worker.on("completed", (job) => {
    logger.info("image-processing job completed", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("image-processing job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}

export function createSearchIndexWorker(): Worker<SearchIndexJobData> {
  const worker = new Worker<SearchIndexJobData>(
    "search-indexing",
    async (job) => indexListingJob(job.data),
    { connection: queueRedis, concurrency: 8 },
  );

  worker.on("completed", (job) => {
    logger.info("search-indexing job completed", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("search-indexing job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}

// Registers the repeating sweep and returns the worker that runs it.
// queue.add() with a fixed jobId + repeat options is idempotent — BullMQ
// dedupes by that combination, so calling this on every worker-process
// restart never creates duplicate schedulers.
export async function createListingExpiryWorker(): Promise<Worker> {
  await listingExpiryQueue.add(
    "sweep",
    {},
    { jobId: "listing-expiry-sweep", repeat: { every: LISTING_EXPIRY_SWEEP_INTERVAL_MS } },
  );

  const worker = new Worker(
    "listing-expiry",
    async () => sweepExpiredListings(),
    { connection: queueRedis, concurrency: 1 },
  );

  worker.on("completed", (job) => {
    logger.info("listing-expiry job completed", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("listing-expiry job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}

export async function createListingImageSweepWorker(): Promise<Worker> {
  await listingImageSweepQueue.add(
    "sweep",
    {},
    { jobId: "listing-image-sweep", repeat: { every: LISTING_IMAGE_SWEEP_INTERVAL_MS } },
  );

  const worker = new Worker(
    "listing-image-sweep",
    async () => sweepStuckListingImages(),
    { connection: queueRedis, concurrency: 1 },
  );

  worker.on("completed", (job) => {
    logger.info("listing-image-sweep job completed", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("listing-image-sweep job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}

export async function createAuthRowPruneWorker(): Promise<Worker> {
  await authRowPruneQueue.add(
    "prune",
    {},
    { jobId: "auth-row-prune", repeat: { every: AUTH_ROW_PRUNE_INTERVAL_MS } },
  );

  const worker = new Worker(
    "auth-row-prune",
    async () => pruneExpiredAuthRows(),
    { connection: queueRedis, concurrency: 1 },
  );

  worker.on("completed", (job) => {
    logger.info("auth-row-prune job completed", { jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    logger.error("auth-row-prune job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}
