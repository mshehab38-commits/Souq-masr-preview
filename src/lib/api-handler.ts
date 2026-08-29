import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

const REQUEST_ID_HEADER = "x-request-id";

// The single boundary between "a route handler threw" and "the client got a
// response" for every API route in this codebase. Every route handler
// exported from src/app/api/**/route.ts (except /api/health, which stays
// deliberately unwrapped — see docs/OBSERVABILITY.md) is wrapped with this.
//
// Responsibilities, all in one place so no route has to remember them:
//  - propagate or mint a request id, echoed back on every response so a
//    user can quote it to support and it can be grepped straight out of
//    the structured logs below;
//  - log the request's start and completion (method, path, status,
//    duration) at "info" — the request LIFECYCLE, not business events
//    (those stay in src/lib/audit.ts, a separate concern);
//  - catch anything a handler doesn't catch itself, log it at "error"
//    with the full message and stack (server-side log only), report it to
//    Sentry (a safe no-op until a real DSN is configured — see
//    sentry.server.config.ts), and return a generic 500 that never leaks
//    the error message or stack to the client — only the requestId, which
//    is exactly what a support agent needs to find the matching log line.
export function withApiHandler<Ctx = unknown>(
  handler: (request: Request, context: Ctx) => Promise<Response>,
): (request: Request, context: Ctx) => Promise<Response> {
  return async (request: Request, context: Ctx) => {
    const requestId = request.headers.get(REQUEST_ID_HEADER) ?? randomUUID();
    const { pathname } = new URL(request.url);
    const start = Date.now();

    logger.info("api.request.start", { requestId, method: request.method, path: pathname });

    try {
      const response = await handler(request, context);
      response.headers.set(REQUEST_ID_HEADER, requestId);
      logger.info("api.request.complete", {
        requestId,
        method: request.method,
        path: pathname,
        status: response.status,
        durationMs: Date.now() - start,
      });
      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("api.request.error", {
        requestId,
        method: request.method,
        path: pathname,
        durationMs: Date.now() - start,
        error: err.message,
        stack: err.stack,
      });
      Sentry.captureException(err, { tags: { requestId, path: pathname } });

      return Response.json(
        { error: "internal_error", requestId },
        { status: 500, headers: { [REQUEST_ID_HEADER]: requestId } },
      );
    }
  };
}
