# Observability

This document is the operational reference for logging, request tracing,
error handling, and Sentry across Souq Masr. Read it before touching
`src/lib/logger.ts`, `src/lib/api-handler.ts`, any `sentry.*.config.ts`
file, `instrumentation.ts`/`instrumentation-client.ts`, or before adding a
new API route (every route handler must use `withApiHandler` — see below).

## Log levels

`src/lib/logger.ts` exposes `debug`/`info`/`warn`/`error`, each emitting one
line of structured JSON (`{ level, message, time, ...fields }`) to
`console.log`/`console.warn`/`console.error` respectively. The policy for
choosing a level:

- **`debug`** — verbose diagnostic detail useful only when actively
  investigating something. Not currently used anywhere in this codebase;
  reach for it before adding a noisy `info` call that nobody needs by
  default.
- **`info`** — normal lifecycle events: a request started/completed, a
  background job started/completed, a scheduled sweep ran. This is what
  `withApiHandler` and the BullMQ workers log by default. High-volume by
  design — this is what a log aggregator's normal traffic looks like.
- **`warn`** — something anticipated and recoverable happened: a rejected
  file upload, a rate-limited request, an unconfigured optional provider
  (SMS, storage fallback), an invalid webhook signature. Not an outage,
  but worth a human noticing in aggregate.
- **`error`** — something unexpected. An uncaught exception in a route
  handler or a background job. Every `error`-level log should be
  actionable — if it isn't, it should have been `warn`.

## Request-id / correlation-id convention

Every API request gets an id: the incoming `x-request-id` header if the
caller already supplied one (useful for a future gateway/load-balancer
that assigns one upstream), otherwise a freshly generated `crypto.randomUUID()`.
It is:

- included in every log line for that request (`api.request.start`,
  `api.request.complete`, `api.request.error`);
- echoed back as the `x-request-id` response header on every response,
  success or failure;
- included in the body of a `500` response as `{ error, requestId }` —
  the one piece of information a user can quote to support, without
  leaking anything about the actual failure.

To find every log line for one request, grep the requestId out of any of
the three log lines above and search for it — start, completion (or
error), and nothing else needed to reconstruct that request's outcome.

## `withApiHandler` — the API request lifecycle boundary

`src/lib/api-handler.ts` exports `withApiHandler(handler)`, and **every**
exported HTTP-method function in `src/app/api/**/route.ts` is wrapped
with it, e.g.:

```ts
export const POST = withApiHandler(async (request: Request) => {
  // ... the actual route logic, unchanged ...
});
```

It is responsible for, in one place, so no individual route has to
remember any of it:

1. Assigning/propagating the request id (above).
2. Logging `api.request.start` (method, path, requestId) before the
   handler runs, and `api.request.complete` (+ status, durationMs) after
   it returns successfully.
3. Catching anything the handler doesn't catch itself, logging
   `api.request.error` (+ the error's message and full stack — this goes
   to the **server log only**), reporting it to Sentry
   (`Sentry.captureException` — a safe no-op until Sentry is activated,
   see below), and returning a generic `500 { error: "internal_error",
   requestId }` — the message and stack never reach the client.

**The one deliberate exception is `/api/health`.** Uptime monitors poll it
every few seconds; an `info` line per hit would drown out everything else
in the logs for zero diagnostic value. It stays a small, unwrapped handler
that checks Postgres and Redis directly and returns `200`/`503`.

**Any new route handler you add must use `withApiHandler`.** This is not
optional — it's the only mechanism providing request-id propagation and
crash safety for the whole API surface.

## Safe error logging — what never gets logged

- **Never log secrets, tokens, session values, or OTP codes.** The
  concrete example this codebase already had and fixed:
  `ConsoleSmsProvider` (`src/modules/identity/sms.ts`) used to log the raw
  OTP code alongside the phone number on every request — in every
  environment, including a hypothetical production deployment before a
  real SMS provider is wired. It no longer logs the code at all; the
  dev/test path for reading a code is the API response's `devCode` field
  (`src/modules/identity/otp.ts`, `NODE_ENV !== "production"` only),
  never logs — every test and e2e spec already reads it that way.
- **Never log a full request body.** Log identifiers (user id, listing
  id, order id) and short reason codes, not the payload that produced
  them — a payload can carry names, phone numbers, addresses, or free
  text a user typed.
- **Client-facing error responses never include a message or stack.**
  `withApiHandler`'s `500` response is always exactly `{ error:
  "internal_error", requestId }`. The message and stack exist only in the
  server-side log line and in Sentry (once activated) — both audiences
  who are supposed to see internal detail, unlike an API consumer.
- **Server-side logs can and should include the full stack.** Hiding it
  there would only hurt debugging; it never reaches a client.

## Background job lifecycle (BullMQ)

`src/jobs/workers.ts`'s three workers (image-processing, search-indexing,
listing-expiry) each log:

- `info` on `worker.on("completed", ...)` — job id only, confirming
  throughput.
- `error` on `worker.on("failed", ...)` — job id and the error message.

This mirrors the API wrapper's start/complete/error symmetry, using
BullMQ's own `job.id` as that boundary's correlation id (no separate
request-id concept needed here — one job, one id, for its whole
lifecycle).

## Frontend error boundaries

- **`src/app/error.tsx`** — the standard Next.js App Router boundary,
  catching any render/data-fetching error below the root layout. Runs in
  the browser (a Client Component, per Next.js's requirement), shows a
  friendly Arabic message with a retry button, and reports to
  `Sentry.captureException` client-side.
- **`src/app/global-error.tsx`** — the same, for the rarer case of the
  root layout itself failing (must render its own `<html>/<body>`, since
  the layout that would normally provide them is what may have failed).

Neither can call the server-side `logger` (they run in the browser) —
Sentry is the reporting path for frontend errors, same as
`onRequestError` is for server-side ones (below).

## Sentry architecture

`@sentry/nextjs` (v8) is installed and wired using Next.js 15's modern
`instrumentation.ts`/`instrumentation-client.ts` hooks (not the older
3-file wizard-generated config):

- **`src/instrumentation.ts`** — Next.js's server/edge startup hook.
  `register()` dynamically imports `sentry.server.config.ts` or
  `sentry.edge.config.ts` depending on the runtime. Also exports
  `onRequestError = Sentry.captureRequestError`, which Next.js calls on
  *any* request-scoped error — Route Handlers and React Server Component
  render errors alike — broader coverage than `withApiHandler` alone
  (which only wraps Route Handlers).
- **`src/sentry.server.config.ts`** / **`src/sentry.edge.config.ts`** —
  each calls `Sentry.init({ dsn: env.SENTRY_DSN, ... })` **only if
  `env.SENTRY_DSN` is set** (an explicit `if`, not reliance on the SDK's
  own no-DSN behavior).
- **`src/instrumentation-client.ts`** — the client-bundle entry point
  (Next.js 15.3+ convention). Reads `NEXT_PUBLIC_SENTRY_DSN` directly from
  `process.env` (must be `NEXT_PUBLIC_`-prefixed to reach the browser
  bundle) with the same explicit guard.
- `withApiHandler` also calls `Sentry.captureException` directly on any
  error it catches, tagged with the requestId — so a Sentry event and a
  structured log line for the same failure share that id.

### Activating Sentry — OWNER DECISION REQUIRED

**Sentry performs zero network activity today.** Nothing was invented —
no DSN, no project, no fabricated credentials. To activate it in any
environment, set two environment variables (see `.env.example`):

```
SENTRY_DSN=https://...@oXXXXXX.ingest.sentry.io/XXXXXXX
NEXT_PUBLIC_SENTRY_DSN=https://...@oXXXXXX.ingest.sentry.io/XXXXXXX
```

(Typically the same DSN value in both — a real Sentry project must exist
first, which is the owner's decision, not an engineering one.) Once set,
every mechanism above starts reporting immediately — no code change
needed.

**Not done this phase, deliberately**: wrapping `next.config.ts` with
`withSentryConfig` for build-time source-map upload. That needs
`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` — a separate
production-credentials decision from the DSN itself. Without it, Sentry
still works; stack traces in the dashboard just won't be
source-mapped to the original TypeScript until this is added later.

## Health check

`GET /api/health` checks both Postgres (`SELECT 1`) and Redis (`PING`) —
the two dependencies nearly every request needs (sessions, rate limiting,
and BullMQ all go through Redis) — and returns `{ status: "ok" | "degraded",
checks: { database, redis } }` with a `200` or `503` accordingly. Not
wrapped with `withApiHandler` (see above) and does not log per-hit.
