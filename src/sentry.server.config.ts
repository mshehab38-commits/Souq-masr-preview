import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

// Explicitly guarded rather than relying on the SDK's own no-DSN no-op
// behavior: this must perform zero network activity until the owner
// supplies a real SENTRY_DSN. See docs/OBSERVABILITY.md — Sentry
// activation is OWNER DECISION REQUIRED.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
