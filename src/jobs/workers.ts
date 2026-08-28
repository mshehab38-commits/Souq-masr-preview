import { Worker } from "bullmq";
import { queueRedis } from "@/lib/queue-redis";
import { logger } from "@/lib/logger";
import { processListingImage, type ImageProcessingJobData } from "./image-processing";
import { indexListingJob, type SearchIndexJobData } from "./search-indexing";

export function createImageProcessingWorker(): Worker<ImageProcessingJobData> {
  const worker = new Worker<ImageProcessingJobData>(
    "image-processing",
    async (job) => processListingImage(job.data),
    { connection: queueRedis, concurrency: 4 },
  );

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

  worker.on("failed", (job, error) => {
    logger.error("search-indexing job failed", { jobId: job?.id, error: error.message });
  });

  return worker;
}
