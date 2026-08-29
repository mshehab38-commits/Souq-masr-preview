import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";

// Deliberately not wrapped with withApiHandler: uptime monitors poll this
// every few seconds, and an info-level log line per hit would drown out
// everything else in the logs for zero diagnostic value. Checks both
// dependencies a request actually needs (DB + Redis, the latter backing
// sessions/rate-limiting/queues) so a partial outage is visible here
// before it surfaces as user-facing errors elsewhere.
export async function GET() {
  const [dbOk, redisOk] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(
      () => true,
      () => false,
    ),
    redis.ping().then(
      () => true,
      () => false,
    ),
  ]);

  const status = dbOk && redisOk ? "ok" : "degraded";
  return NextResponse.json({ status, checks: { database: dbOk, redis: redisOk } }, { status: status === "ok" ? 200 : 503 });
}
