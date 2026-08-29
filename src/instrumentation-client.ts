import * as Sentry from "@sentry/nextjs";

// Client-bundle entry point (Next.js 15.3+ convention). Must read
// NEXT_PUBLIC_SENTRY_DSN directly from process.env (not the server-only
// `env` module) since this file runs in the browser and Next.js only
// inlines NEXT_PUBLIC_-prefixed vars into the client bundle. Explicitly
// guarded — see sentry.server.config.ts for why.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
