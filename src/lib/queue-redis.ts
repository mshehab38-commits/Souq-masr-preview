import Redis from "ioredis";
import { env } from "@/lib/env";

// BullMQ requires its own connection with maxRetriesPerRequest disabled —
// kept separate from lib/redis.ts, which is tuned for request-scoped
// operations like rate limiting and needs the opposite behavior.
const globalForQueueRedis = globalThis as unknown as { queueRedis?: Redis };

export const queueRedis =
  globalForQueueRedis.queueRedis ?? new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

if (process.env.NODE_ENV !== "production") {
  globalForQueueRedis.queueRedis = queueRedis;
}
