import * as Sentry from "@sentry/nextjs";

// Next.js's server/edge startup hook (stable since Next.js 15). Loads the
// Sentry config appropriate to the runtime this process is actually
// running in — both configs are themselves guarded on env.SENTRY_DSN
// being set (see sentry.server.config.ts), so this is inert until the
// owner activates Sentry.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Next.js's generic request-error hook — covers Route Handler exceptions
// (in addition to, not instead of, withApiHandler's structured logging in
// src/lib/api-handler.ts) and React Server Component render errors, which
// nothing else in this codebase observes. A safe no-op call when Sentry
// was never initialized above.
export const onRequestError = Sentry.captureRequestError;
