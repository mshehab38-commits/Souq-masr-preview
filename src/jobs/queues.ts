import { Queue } from "bullmq";
import { queueRedis } from "@/lib/queue-redis";
import type { ImageProcessingJobData } from "./image-processing";
import type { SearchIndexJobData } from "./search-indexing";

export const LISTING_EXPIRY_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86_400 },
};

export const imageProcessingQueue = new Queue<ImageProcessingJobData>("image-processing", {
  connection: queueRedis,
  defaultJobOptions,
});

export const searchIndexQueue = new Queue<SearchIndexJobData>("search-indexing", {
  connection: queueRedis,
  defaultJobOptions,
});

export const listingExpiryQueue = new Queue("listing-expiry", {
  connection: queueRedis,
  defaultJobOptions,
});
