import * as Sentry from "@sentry/nextjs";
import { env } from "@/lib/env";

// Same guard as sentry.server.config.ts — see there for why it's explicit
// rather than relying on the SDK's own no-DSN behavior.
if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}
