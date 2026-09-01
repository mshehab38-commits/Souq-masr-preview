# Architecture & Technical Decisions

A log of non-obvious technical decisions and the reasoning behind them,
so future sessions (or reviewers) don't have to reverse-engineer *why*
from the diff alone. Ordered roughly by phase/date. Purely technical —
financial/commercial decisions belong to the project owner and are
tracked as "OWNER DECISION REQUIRED" items in `PROJECT_STATE.md`, not
here.

## Modular monolith, not microservices

One deployable app, with `src/modules/<domain>/` boundaries enforced by
`dependency-cruiser` rather than network/process boundaries. Chosen
because the team is small and the scale target (millions of users, not
yet billions of requests/sec) doesn't justify the operational overhead of
microservices, while still keeping the internal seams clean enough to
extract a module into its own service later if ever needed. Enforcement
is mechanical (`npm run boundaries` in CI), not a style-guide convention
that erodes over time.

## Session tokens are opaque and server-hashed, not JWT

`Session.tokenHash` stores only a SHA-256 hash; the raw token exists only
in the httpOnly cookie on the client. This means a session can be
revoked instantly and server-side (logout, ban, suspicious activity) by
deleting/marking one row — a JWT can't be revoked without a separate
blocklist, which reintroduces the same server-side state a JWT is
usually chosen to avoid. Since sessions are already looked up per
request for CSRF/auth anyway, JWT's main advantage (statelessness) buys
nothing here.

## CSRF via double-submit cookie, not a synchronizer token

Given session tokens are already opaque cookies (not `Authorization`
headers), CSRF protection needed a mechanism that doesn't depend on
server-side per-form token storage. Double-submit (a second cookie whose
value must be echoed back in a request header) is the standard fit for
this and requires no extra database table.

## Storage provider selection is gated on `NODE_ENV`, not on presence of config

`getStorageProvider()` (`src/lib/storage/index.ts`) only selects
`R2StorageProvider` when `env.NODE_ENV === "production"` **and** all
`STORAGE_*` vars are set — not merely when the vars are set.

This was a real bug found and fixed during Phase 3 stabilization:
`env.ts`'s production-mode validation requires `STORAGE_*` to be set
(so a real deployment can never silently boot without real object
storage — see "Env validation fails at boot, not silently degrades"
below). But `next build` forces `NODE_ENV=production` internally even
when building for local testing, so `.env` needed *some* value for those
vars to pass validation — and those values are necessarily placeholders
(`https://placeholder-account.r2.cloudflarestorage.com`, etc.), since
real R2 credentials are a production deployment decision, not something
to invent locally.

With the original "select R2 if vars are present" logic, `next dev` and
the Playwright e2e suite — which both load the same `.env` — silently
tried to `PUT` real image uploads to that non-resolvable placeholder
hostname. The request never completed, so the subsequent
`images/confirm` call never fired, and no `ListingImage` row was ever
created — with no error surfaced anywhere a browser-side listener could
catch it in time (not a `requestfailed` network error, just a hang).
Gating on `NODE_ENV` as well fixes this: dev/test always use
`LocalStorageProvider` regardless of what placeholder values happen to
be sitting in `STORAGE_*`, and only a real production boot (real
`NODE_ENV=production` from the hosting platform, not from `next build`'s
internal forcing) uses R2.

## Env validation fails at boot, not silently degrades

`src/lib/env.ts` uses a Zod `.superRefine()` that only requires
`OTP_PEPPER` and the full `STORAGE_*` set when `NODE_ENV === "production"`.
A production deployment missing real secrets crashes immediately at
startup with a clear validation error, rather than booting successfully
and then failing (or silently doing the wrong thing, like falling back to
local filesystem storage in production) the first time a request needs
that config.

## `pg_trgm` `word_similarity()`/`<%`, not `similarity()`/`%`

Discovered via direct `psql` testing while tuning Arabic search
relevance: `similarity()` compares two strings as a whole, so a short
query against a long concatenated `searchText` field scores low even on
an exact substring match (a real test case scored 0.19, comfortably below
the default 0.3 threshold, for a query that exactly appeared in the
target string). `word_similarity()` instead finds the best-matching
*substring* of the target and scores that — appropriate here since
`searchText` is "title + description" and queries are almost always
much shorter than that combined text. Verified directly in `psql`
(`word_similarity('لابتوب', searchText)` returning `1` for an exact
substring) before switching the provider's SQL over.

## Search results paginate by page, not cursor

`SearchProvider.search()` returns `{ items, page, pageSize, total }`
rather than a cursor. The existing `Pagination` UI component (from the
Phase 1B design system) is page-number-based; matching that was a
deliberate consistency choice over the marginal efficiency gains of
cursor pagination, which don't matter yet at this data scale and would
require a different UI component to expose.

## Listing writes enqueue async search indexing rather than computing inline

`createListing`/`updateListing` push a `{ listingId }` job onto the
`search-indexing` BullMQ queue rather than computing and writing
`searchText` synchronously in the same request. This keeps the write
path's latency independent of however expensive text normalization/
indexing becomes later (e.g. if a future `SearchProvider` implementation
needs to also push to an external index like OpenSearch), and means
adding a second search backend later only means adding a second job
consumer, not touching the write path at all.

## Commerce eligibility: three independent signals, not one enum

See `docs/DATABASE.md` "Commerce Eligibility Model" for the full
breakdown of `Category.commerceDefault` / `User.commerceVerifiedAt` /
`Listing.commerceEnabled` + `fulfillmentMode`. Chosen specifically
because the product requirement was explicit: checkout must not be
restricted to business accounts, category eligibility must be a default
rather than a permanent lock, and the actual per-listing state must be
admin/backend-controlled rather than hardcoded into frontend components.
A single flat enum can't express "verified individual sellers can enable
checkout on an admin-review category listing if an admin overrides it"
without becoming a combinatorial mess; three orthogonal signals resolved
by one function (`resolveCommerceEligibility`) can.

## Category attributes are fully data-driven

`CategoryAttribute` rows drive both server-side Zod validation
(`validateListingAttributes`) and client-side form rendering
(`NewListingForm.tsx`) — there is no per-category `if (categoryId ===
...)` branch anywhere in the codebase. Adding or changing a category's
fields is a data change (eventually via the Phase 9/10 admin UI), never
a code change or deployment.

## Two separate Redis connections

`src/lib/redis.ts` (general use: caching, rate limiting) uses
`maxRetriesPerRequest: 3` — a bounded retry count is the correct choice
for request-scoped operations that should fail fast rather than hang a
request. `src/lib/queue-redis.ts` (BullMQ only) uses
`maxRetriesPerRequest: null`, which BullMQ requires — it throws at
worker startup otherwise, since it manages its own retry/backoff
semantics for job processing. These can't be the same client instance
because the two settings are mutually exclusive requirements from
different libraries.

## Background jobs run in a separate process, not inside the Next.js server

`src/worker.ts` is a standalone entrypoint (`npm run worker`), not code
that runs inside a Next.js API route or middleware. A slow or crashing
image-processing job can never block or crash request handling, and the
worker tier can be scaled (more processes/replicas) independently of the
web tier once load requires it — without any code change, just a
deployment/ops change.

## `worker.ts` wraps startup in `async function main()`, never top-level `await`

Found during Phase 4: adding a third worker (`createListingExpiryWorker`,
which needs to `await` a `queue.add()` call before it can return) via a
top-level `await` in `src/worker.ts` compiled fine under `tsc` (the
`tsconfig.json` module target allows top-level await) but crashed
immediately at runtime — `tsx` transpiles this entrypoint to CJS output
(no `"type": "module"` in `package.json`), and esbuild's CJS output
doesn't support top-level await at all. The crash was silent in practice:
`e2e/global-setup.ts` spawns the worker process with `stdio: "ignore"`,
so nothing surfaced except an unrelated-looking Playwright timeout in
`listing-search-flow.spec.ts` (waiting on an image-processing job that
was, in fact, never running — the worker process had already exited).
Root-caused by running `npm run worker` directly instead of through
Playwright's plumbing, which showed the `esbuild`/`ERR_REQUIRE_ASYNC_MODULE`
error immediately. Fixed by wrapping all startup logic in an `async
function main()` and calling it with a `.catch()` — the general lesson:
any script run through `tsx` as a direct entrypoint (not imported) should
avoid top-level `await`, even though `tsc --noEmit` won't catch the
mismatch.

## Store slugs: random suffix always, never an incrementing counter

`generateStoreSlug()` (`src/modules/store/slug.ts`) always appends an
8-hex-character random suffix to whatever ASCII base it can derive from
the store name, rather than trying `name`, then `name-2`, `name-3`, etc.
on collision. Store names are frequently Arabic and often reduce to no
ASCII content at all (`store-<suffix>` fallback), so a meaningful
human-readable slug usually isn't achievable anyway — and a fixed-length
random suffix turns slug generation into a single
insert-and-retry-on-conflict operation instead of a read-then-write race
that would need its own locking under concurrent store creation.

## Branding uploads (logo/cover) are synchronous, not queued through BullMQ

`uploadStoreBranding()` resizes and re-encodes the image inline in the
request handler, unlike listing photos which go through the async
`image-processing` queue with three generated variants. Branding images
are low-volume (one logo, one cover, per seller, changed rarely) and the
store settings page needs the result immediately to show the update —
there's no user-facing benefit to the async multi-variant pipeline here,
only added complexity. Still shares the listing pipeline's
never-trust-client-`Content-Type` magic-byte check (`detectImageMime`,
imported directly from `src/jobs/image-processing.ts` rather than
duplicated) and its EXIF-stripping behavior (`rotate()` then re-encode
without `withMetadata()`).

## Storefronts have no pricing/subscription fields

`Store` is a free branding and discovery surface in this phase — no
tier, no fee, no financial field of any kind. This is deliberate, not an
oversight: introducing paid store tiers would require pricing/commission
decisions that belong to the project owner, not something to invent
while building the technical feature. If paid tiers are wanted later,
that's a new phase with its own OWNER DECISION REQUIRED items, layered on
top of this model rather than requiring it to change.

## Ledger accounts are chosen explicitly by the caller, never inferred

`recordLedgerEntry()` (`src/modules/ledger/ledger.ts`) takes `account` as
a required parameter rather than deriving it from `type`. The
alternative — a lookup table mapping `SUBSCRIPTION_REVENUE` →
`PLATFORM_REVENUE`, `SELLER_PAYOUT` → `SELLER_PAYABLE`, etc. inside the
ledger module — would be less code at each call site, but it would also
mean a mistake in that internal mapping silently mis-tags every entry of
that type platform-wide, discoverable only by auditing the ledger module
itself. Requiring each caller to state `account` explicitly means a bug
(e.g. accidentally tagging an order's product price as
`PLATFORM_REVENUE`) is visible in the diff of the calling code during
review, which is exactly the code that a reviewer is already looking at
when checking "does this respect the zero-commission model."

## Cash-on-delivery is the payment default, not a stopgap

`CodPaymentProvider` requires no gateway integration, no merchant
account, and produces no processing fee at all — the buyer pays the
seller/courier directly, and Souq Masr never holds the money for that
order. This isn't a placeholder pending "real" payments — cash-on-delivery
is a dominant, production-viable payment method in the Egyptian
e-commerce market. `PaymentProvider.getPaymentProvider()` defaults to it
and it's the only method actually reachable until real Paymob credentials
exist (see the next decision).

## Paymob is implemented but only ever selected with real credentials

`PaymobPaymentProvider` (`src/modules/payments/paymob-provider.ts`) is a
full implementation of Paymob's documented Accept API v1 flow (auth
token → order registration → payment key → iframe redirect, plus HMAC
webhook verification) — not a stub. But `getPaymentProvider("ONLINE")`
throws unless `PAYMOB_API_KEY`/`PAYMOB_INTEGRATION_ID`/
`PAYMOB_IFRAME_ID`/`PAYMOB_HMAC_SECRET` are all set, and no such
credentials have been supplied (a production-credentials decision for
the owner, not an engineering one). This mirrors the established
storage-provider pattern (`R2StorageProvider` only selected when real R2
credentials exist; `LocalStorageProvider` otherwise) — the real
implementation exists and is ready, but is never fabricated into use
without real secrets. **Caveat**: this has never been exercised against
Paymob's live sandbox, since no credentials exist to test with. Verify
the exact request/response shapes and the webhook HMAC field order
against their current documentation before relying on it in production —
their public API has changed shape before.

## Company-wide shipping fallback lives on `ShippingCompany`, not a nullable `ShippingRate` row

The original design used `ShippingRate.governorateId: String?`, with a
`null` value meaning "this company's default rate for any governorate
without a specific one." The `@@unique([shippingCompanyId,
governorateId])` constraint was meant to guarantee at most one such
default row per company — but Postgres unique indexes treat every `NULL`
as a distinct value, so that constraint could never have actually
enforced it; a second `null`-governorate row for the same company would
have inserted without conflict, silently breaking the "one default"
invariant the code assumed. This was caught before it ever ran against a
real database: Prisma's generated TypeScript types for the compound
`where`-unique input reject a `null` `governorateId`, since Prisma itself
knows this key can't reliably identify one row when null is involved.
Fixed by moving the fallback to `ShippingCompany.defaultFlatFee` — a
genuinely singular field on a genuinely singular row — and making
`ShippingRate.governorateId` (and `flatFee`) required, so the compound
unique key now does what it always should have (migration
`fix_shipping_rate_default_fee_design`). General lesson: a nullable
column inside a composite unique constraint is very rarely the right way
to model "the default case" in Postgres — model the default as its own
field on the parent instead.

## Admin-driven configuration got a real UI now, not deferred to the Admin phase

`/admin/{settings,plans,shipping,ledger}` are full, usable pages in this
phase, not just API routes waiting for a later "Admin" phase to add a
UI. The reasoning: every one of these values (free-listing limit,
subscription prices, shipping rates/commission) is something the owner
needs to actually set to run the business *today* — building the API
without a way to call it (short of raw HTTP requests) wouldn't meet the
spirit of "the owner must be able to configure this without a code
change." The later, broader Admin phase (Phase 9/10 in the original
roadmap) is about user/listing moderation and platform operations, not
about un-blocking basic commercial configuration that can't wait that
long.

## `OrderCancelledBy` needed its own `ADMIN` value, not reuse of `SYSTEM`

The order state machine (`src/modules/orders/state-machine.ts`) always
treated `ADMIN` as a distinct actor from `SYSTEM` — an admin's override
is a human support/dispute-resolution action; `SYSTEM` is reserved for
fully automated transitions (e.g. a future live courier webhook marking
`PICKED_UP`). But the `OrderCancelledBy` enum only had
`BUYER`/`SELLER`/`SYSTEM`, so `transitions.ts`'s (already-correct)
`cancelledBy = actor === "SYSTEM" ? "SYSTEM" : actor` logic crashed with
a Prisma validation error the first time an admin actually cancelled an
order — caught by a test
(`tests/orders/transitions.test.ts`), not by manual testing, since the
manual verification pass earlier in this phase happened not to exercise
that specific actor. Fixed by adding `ADMIN` to the enum rather than
mapping admin actions onto `SYSTEM`, since conflating "a person
intervened" with "this happened automatically" would make the audit
trail actively misleading for exactly the cases (disputes, support
overrides) where an accurate record matters most.

## `requireModerator()` and `requireAdmin()` are split, and the split lives at different layers for different pages

Phase 6 needed a `MODERATOR` role (already declared in the schema since
Phase 2, never checked anywhere) to reach the new reports queue and
verification review, without giving it the financial/config authority
`ADMIN` already had over settings/plans/shipping/ledger. Rather than
inventing a permissions matrix, the shared `/admin` layout gate was
loosened from `requireAdmin()` to the new, broader `requireModerator()`
(`ADMIN` or `MODERATOR`), and each of the four Phase 5 financial pages
re-checks `requireAdmin()` itself and redirects if it fails. This means
the authorization boundary isn't in one place for every route — it's
intentionally the looser gate at the shell plus a stricter gate on the
pages/routes that need it, mirroring how `PATCH
/api/admin/users/[id]` requires `requireAdmin()` even though `GET
/api/admin/users/[id]` (same resource) only requires
`requireModerator()`, and how `PATCH /api/admin/reports/[id]` requires
`requireAdmin()` specifically only when the resolution action is
`SUSPEND_USER`. The alternative — one central permission table keyed by
route — would be more centralized but wrong for `PATCH
/api/admin/reports/[id]`, where the required role depends on the request
*body*, not just the route; a single gate can't express that.

## Suspending/banning a user revokes sessions explicitly, even though `session.ts` already blocks them

`getSessionUser()` has checked `session.user.status !== "ACTIVE"` since
Phase 2, so a suspended/banned user's *next* request already fails
without any Phase 6 change. `setUserStatus()` still explicitly revokes
every active `Session` row when moving a user out of `ACTIVE`. This is
deliberate defense-in-depth on a security-sensitive action, not
redundant: it makes the audit trail explicit (a revoked session is
visible in the `sessions` table, not just an implicit consequence of a
`status` column elsewhere) and removes any dependency on that other
check always being present/correct in the future.

## `Report` targets a listing or a user, never both — enforced by a hand-added `CHECK` constraint

A report needed to point at either a `Listing` or a `User`, and Prisma
has no native way to say "exactly one of these two nullable foreign
keys must be set, matching this enum column" — the same category of gap
that made the original `ShippingRate` design (a nullable `governorateId`
meant to represent "this company's default rate") unable to actually
enforce "at most one" via `@@unique`. Rather than accept the same class
of bug twice, the `Report` migration hand-appends a `CHECK` constraint
(`reports_target_consistency_check`) after Prisma's generated SQL,
enforcing the invariant at the database level regardless of which
application code path writes the row. `createReport()` also validates
the same rule in application code first, so a caller gets a clear
`target_not_found`/discriminated-union type error rather than a raw
Postgres constraint violation — the constraint is the backstop, not the
primary interface.

## Report resolution performs the side-effect action before marking the report resolved, not after

`resolveReport()` with `action: "REMOVE_LISTING"` or `"SUSPEND_USER"`
calls into `catalog`'s `adminRemoveListing()` or `identity`'s
`setUserStatus()` *before* writing the report's own `status`/
`reviewedById`/`reviewedAt` fields, and returns `action_failed` (leaving
the report `OPEN`) if that call reports failure. The alternative order
— mark resolved, then perform the action — risks a report silently
sitting as "handled" in the queue while the listing is still live or the
user still active, which is worse than a moderator seeing the same
report again and retrying.

## Verification approval promotes role only for a still-`INDIVIDUAL` user, never touches `ADMIN`/`MODERATOR`

`reviewVerificationRequest()` sets `User.role = "BUSINESS"` on a `BUSINESS`
verification approval, but only when the user's *current* role is still
`INDIVIDUAL`. `role` had never been set to anything but its default by
any code path before this phase, so this is a low-risk, additive change
in isolation — but the explicit guard exists so that a business-type
verification request submitted by (or on behalf of) an `ADMIN`/
`MODERATOR` account can never accidentally downgrade their operational
role. The check is a plain equality, not a role hierarchy comparison,
deliberately, since this codebase has no other place that needs to
reason about role ordering.

## Notifications are in-app only — no email/SMS channel yet

Phase 7 needed to tell users about events (new order, status change,
report resolved, verification decided) that they previously only found
out about by checking their own pages. Building this required deciding
*how* to deliver it. Real email/SMS delivery needs an actual provider
decision (which email service, or extending `SmsProvider` beyond OTP) —
the same category of gap as Paymob in Phase 5: buildable, but only ever
selected once real credentials/a provider choice exist, never
fabricated. In-app notifications need no such credential and deliver
real, working value today, so Phase 7 scope is in-app only; external
channels are deferred, not attempted with a fake/console-log provider
that would look real but do nothing.

## `ORDER_STATUS_LABELS` is intentionally duplicated between the `orders` module and its app-layer file, not shared through `service.ts`

While wiring the order-status-change notification, the same Arabic
label map already existed in `src/app/orders/order-status-labels.ts`
(client-component-facing) as a standalone object. The first attempt
re-exported it from `@/modules/orders/service` to avoid duplicating the
text. That broke the client bundle: `orders/service.ts` statically
re-exports `checkout.ts`/`transitions.ts`, which import
`catalog/service.ts` → `catalog/listings.ts` → `jobs/queues.ts` →
`bullmq`, which needs Node's `child_process` — reachable from a client
component (`OrderActions.tsx`) that only wanted a plain string lookup.
Caught immediately by the Playwright suite (Next.js's dev server surfaced
a "Module not found: Can't resolve 'child_process'" build error on
every page using that component). Fixed by reverting to two independent
copies of the label map — one in `state-machine.ts` (used server-side by
the notification title), one in the app-layer file (used by client
components) — rather than routing presentation text through a module
barrel that isn't safe to import from the browser. The lesson generalizes:
a `service.ts` barrel's safety for client-side import depends on
*everything* it statically re-exports, not just the one export a caller
wants — any module whose barrel touches a queue/worker file is unsafe to
import, even partially, from `src/app/` client components.

## `ConsoleSmsProvider` no longer logs the OTP code — it was a live secret-in-logs risk, not just a style issue

An observability audit (Phase 8) found that `ConsoleSmsProvider.sendOtp()`
(`src/modules/identity/sms.ts`) logged the raw OTP code alongside the
phone number, unconditionally, in every environment. Since it's the only
`SmsProvider` implementation that exists (no real SMS gateway is wired
yet), this meant: if this code ever ran in production before a real
provider is configured, every login code for every user would be written
into structured logs, retrievable by anyone with log/observability
access. Checked whether anything actually needed this: no — every test
and e2e spec reads the code from the API response's `devCode` field
(`requestOtp()`, gated `NODE_ENV !== "production"`), never from logs.
Removed `code` from the logged fields entirely; zero functional or test
impact. See `docs/OBSERVABILITY.md` for the "what never gets logged"
policy this now exemplifies.

## Every API route is wrapped with `withApiHandler`, not just logged inline where convenient

Phase 8 needed request-id propagation and consistent start/complete/error
logging across all 51 API route handlers. Next.js's App Router offers no
"before every request, after every request" hook for Route Handlers
specifically (`middleware.ts` only runs *before*, in the Edge runtime, and
can't observe the handler's eventual response or catch its exceptions;
`instrumentation.ts`'s `onRequestError` only fires *on* error, not on
every request). The only way to get true lifecycle logging is wrapping
each handler, so `src/lib/api-handler.ts` exports one `withApiHandler`
function applied uniformly, rather than duplicating ad-hoc logging calls
inside each route (which would drift in format and easily get skipped on
new routes). The mechanical rewrite of all 51 files was done with a
one-off Node script using the TypeScript compiler API (not regex or
brace-counting) specifically because several routes contain template
literals with `${...}` interpolation inside audit-log calls (e.g.
`` `store.branding.${kind}` ``) that would confuse a naive brace-counter
into miscounting the function body's end — the AST-based approach is
immune to that by construction. `/api/health` is the one deliberate
exception (see `docs/OBSERVABILITY.md`) since uptime-monitor traffic would
otherwise dominate the logs for no diagnostic value.

## Sentry activation requires a real DSN — never invented, never a placeholder

`@sentry/nextjs` was already an installed dependency with no
initialization code. Phase 8 wired the full Next.js 15 `instrumentation.ts`/
`instrumentation-client.ts` integration, but every `Sentry.init()` call is
behind an explicit `if (dsn is set)` guard — not reliance on the SDK's own
documented no-DSN no-op behavior, to remove any ambiguity about whether
this performs network activity before the owner provides a real Sentry
project DSN. This mirrors the same principle already applied to Paymob
(Phase 5): technical infrastructure may be built ahead of credentials,
but nothing may activate, or even attempt, until real ones exist.
Wrapping `next.config.ts` with `withSentryConfig` (for build-time
source-map upload) was deliberately not done this phase — it needs
`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`, a separate
production-credentials decision from the DSN itself, and is a
nice-to-have (readable stack traces in the dashboard), not a functional
requirement.

## `SiteHeader`'s desktop and mobile navs share one `NAV_LINKS` source of truth, never duplicate link lists

A Phase 9 audit found `SiteHeader` had **zero responsive behavior** — every
nav link, the "add listing" button, the notification bell, and the
profile/login link were all unconditionally rendered in one row, which
wraps or overflows badly below roughly tablet width (Egypt's marketplace
traffic skews heavily mobile — CLAUDE.md's "mobile responsiveness"
requirement was genuinely unmet here, not just imperfect). Rather than
writing a second, separate list of links for a new mobile hamburger panel
(the obvious but drift-prone shortcut — two lists of the same links
inevitably go out of sync the next time a nav item is added or renamed),
`src/components/layout/nav-links.ts` holds the single canonical list, and
both `SiteHeader` (desktop, `hidden md:flex`) and the new
`MobileNav` (mobile, rendered only inside the `md:hidden` wrapper) render
from it. `MobileNav`'s panel is positioned with a plain
`fixed inset-x-4 top-16` rather than a centered-transform scheme, because
this app is RTL-only (`<html lang="ar" dir="rtl">`, no LTR mode exists
anywhere) — a dual LTR/RTL positioning scheme would have been unused
complexity. The panel's `<nav>` carries an explicit
`aria-label="روابط الموقع"` specifically so the e2e test (and any future
one) can unambiguously target the now-visible mobile link once the panel
opens, without colliding with the still-present-but-hidden desktop link
of the same name in the DOM.

## Report rate limiting is a per-reporter sliding window, mirroring the OTP limiter, not a listing/user-pair check

Phase 6 already prevented a duplicate *open* report against the exact
same target (the dedupe check in `createReport`), but that check does
nothing against a reporter opening reports against many *different*
targets in quick succession — flagged as an explicit Deferred item in
`PROJECT_STATE.md` since Phase 6. Phase 9 closed it the same way the
identity module's OTP request limiter already works
(`src/modules/identity/otp.ts`): a Redis counter keyed per-actor
(`reports:rate:<reporterId>`), incremented with `INCR` +
`EXPIRE` on each new report and checked against a fixed ceiling (20 per
rolling hour) before any database write. Deliberately **not** incremented
on the dedupe (`alreadyOpen: true`) path — a user re-submitting a report
against a target they already reported isn't the abuse pattern this
guards against, and penalizing it would make the dedupe response itself
feel punitive. `POST /api/reports` maps the new `rate_limited` error to
`429`, the conventional HTTP status for exactly this case.

## Flagging a listing for review is a separate status transition from removing it, not a variant of the same action

Phase 6 gave moderators exactly two outcomes for a reported listing:
dismiss the report, or permanently remove the listing (`adminRemoveListing`
— soft-deleted, `status: REMOVED`). That's a hard binary for anything
ambiguous: a report that might be legitimate but isn't clear-cut yet has
no middle ground between "do nothing" and "take the listing down for
good." Phase 10 used the `PENDING_REVIEW`/`REJECTED` `ListingStatus`
values (declared in the schema since Phase 3, never set by any code path
until now — see `docs/DATABASE.md`) to add a genuine third option:
`flagListingForReview()` hides the listing from public view by status
alone, without touching `deletedAt`, so it can be restored to `ACTIVE`
by a later `decidePendingListing()` call without the seller having to
re-create it. This is deliberately a *new* `resolveReport()` action
(`FLAG_FOR_REVIEW`) alongside `REMOVE_LISTING`, not a flag on it — the
two have different reversibility and different data-model effects
(`deletedAt` set vs. not), and keeping them as distinct actions makes
that visible at every call site rather than hidden behind a boolean.
`decidePendingListing` is its own standalone moderator action (off a new
`/admin/listings/pending-review` queue) rather than living inside
`resolveReport`, because by the time a listing is decided it may have
accumulated multiple reports, or none tied to the specific decision — the
queue works off the listing's own status, not off a particular report.

## `getListingById` gates visibility by status and role — a real access-control gap, not just a Phase 10 nicety

While wiring `PENDING_REVIEW`/`REJECTED` above, an audit of
`getListingById` found it had **no visibility check at all**: it filtered
only on `deletedAt: null`, meaning a `DRAFT` listing (never published) or
a `PENDING_REVIEW`/`REJECTED` listing (as of this phase, moderated content
awaiting or denied publication) was fetchable by anyone who knew or
guessed its ID — including through `GET /api/listings/[id]`, which had no
authentication check whatsoever. Fixed by gating: a non-owner sees a
listing only if its status is `ACTIVE`/`SOLD`/`EXPIRED` (the previously
publicly-reachable set — deliberately unchanged, to avoid any regression
for legitimately-public closed listings), with an explicit exception for
a `MODERATOR`/`ADMIN` viewer, who can see any non-deleted listing
regardless of status, since moderating hidden content requires being able
to look at it. This is why `getListingById` and the two call sites that
matter (`GET /api/listings/[id]`, the listing detail Server Component)
now take the viewer's id *and* role, not just their id.

## Playwright's default 30s per-test timeout was raised to 60s

Discovered while validating Phase 10: `e2e/store-management-flow.spec.ts`
(pre-existing, untouched this phase) intermittently timed out at exactly
~30s on a fresh `next dev` server, despite every individual step in it
being fast — it's simply the first spec in a run to touch several
distinct routes (`/dashboard/store`, `/store/[slug]`, `/listings/mine`,
`/api/listings/bulk`) that each pay Next.js's on-demand compile cost once.
Confirmed by re-running the same spec with a longer timeout (passed,
~31s total) — not a real hang or regression. Playwright's global
`timeout` is now `60_000` in `playwright.config.ts` rather than leaving
every multi-route spec exposed to this sandbox's cold-compile variance.

## The real SMS provider is a generic HTTP POST, not a specific vendor's API

Phase 11 extended `SmsProvider` (OTP-only until now) to general
notification delivery. The obvious path — implement one real vendor's
documented API, the way `PaymobProvider` implements Paymob's — was
rejected for SMS specifically: Paymob was already established as *the*
gateway for this project's payments; no SMS gateway has been named or
chosen for Egypt, and guessing one (Twilio? Vonage? a local aggregator?)
from training knowledge risks the exact problem already flagged for
Paymob itself — "built from documented shapes, never verified against a
real sandbox" — but with an extra unresolved layer of *which* vendor's
shape to guess. Instead, `HttpSmsProvider` (`src/modules/identity/sms.ts`)
POSTs a vendor-neutral `{ to, message }` JSON body with a bearer token to
a configurable URL (`SMS_PROVIDER_API_URL`/`SMS_PROVIDER_API_KEY`,
optional everywhere, gated the same way Sentry's DSN is — an explicit
presence check, not the SDK/fetch's own absence-tolerant behavior).
Activating it for a real gateway needs, at most, a thin adapter in front
of that gateway satisfying this one contract — a smaller, more honest
unit of unverified-until-tested integration work than a full
vendor-specific client would be. Picking the actual gateway (and thus
whether an adapter is even needed) stays the owner's call, same category
as Paymob's production credentials.

## Every notification also gets an SMS attempt — no per-type allowlist

`createNotification()` (`src/modules/notifications/notifications.ts`)
sends a best-effort SMS mirror of every notification it creates,
regardless of `NotificationType`, rather than curating a subset deemed
"important enough." An allowlist would be an arbitrary judgment call with
no real usage or cost data behind it yet (no SMS gateway is even
connected), whereas "every type, for now" is simple, has an obvious
undo (add a `notification-sms-exclude` set later, once real volume/cost
data exists), and never risks silently under-notifying a user about
something that turns out to matter. It costs nothing until the owner
wires real gateway credentials. A lookup or send failure is logged and
swallowed inside `createNotification` — it must never make the in-app
notification (the actual source of truth) fail to save.

## `notifications` and `identity` import each other's `service.ts` — a real, verified-safe cycle

Wiring SMS into `createNotification` made `notifications/notifications.ts`
import `getSmsProvider` from `identity/service.ts` — while
`identity/verification.ts` already imports `createNotification` from
`notifications/service.ts` (since Phase 6, for verification-decision
notifications). This is a genuine module-level circular import, not
theoretical. `dependency-cruiser`'s boundary rule only forbids reaching
into a module's *internals*; it doesn't forbid cycles between two
`service.ts` barrels, and none was introduced here. Checked empirically,
not just assumed safe: every export on both sides of the cycle
(`createNotification`, `getSmsProvider`) is a `function` declaration
(hoisted before any module-body code runs), not a `const` arrow function
— the specific case where ESM/CJS circular imports break is a `const`
export being read before its module has finished initializing, which
hoisted function declarations are immune to. `tests/identity`,
`tests/moderation`, and `tests/orders` (all three touch this cycle
transitively) pass, confirming it in practice, not just in theory.

## A migration folder's timestamp must sort after everything it depends on — not just after its own creation time

Building Phase 12's migration surfaced a real, previously-undetected bug:
`npx prisma migrate dev` failed replaying the migration history into a
fresh shadow database with `type "NotificationType" does not exist`. The
cause: `20260829074331_add_listing_review_notification_types` (Phase 10,
an `ALTER TYPE ... ADD VALUE`) was folder-named with an earlier timestamp
than `20260829130000_add_notifications` (Phase 7, the `CREATE TYPE` it
needs), even though it was *applied* to the real dev database *after* —
`prisma migrate dev` against an already-migrated database just appends
and runs the new migration directly, oblivious to what its folder name
implies about ordering. `prisma migrate deploy` (what CI and any fresh
environment actually run) has no such luxury: it replays strictly by
lexicographic folder name, so it would have failed identically on a
truly empty database. This had never been caught because this project's
CI only triggers on `push: main` / `pull_request`, and neither had
happened since the bad migration was added — the bug was real and
deploy-blocking, just never yet exercised. Fixed by renaming the folder
to `20260829140000_...` (`git mv`) and updating the matching
`_prisma_migrations.migration_name` row on the dev database to keep it
in sync, then re-running `migrate dev` to confirm a clean shadow-database
replay. See `docs/DATABASE.md` for the operational rule this establishes
going forward.

## Saved-search matching is a field predicate, not a re-run of the live search engine

`notifyMatchingSavedSearches()` (`src/modules/search/saved-searches.ts`)
checks a new listing against every saved search's stored filters using
plain equality/range checks on category/governorate/city (by slug — the
same identifiers `RawSearchParams` already stores, needing no per-saved-
search database lookup) and price, plus a normalized substring check on
the free-text `q` field against the listing's own `searchText`. It
deliberately does not call `PostgresSearchProvider.search()` once per
saved search: that would be a full `word_similarity` ranked query, with
GIN index traversal, run once for every saved search on every single new
listing — a cost that scales with total saved searches, not with
anything about the new listing. The tradeoff, stated plainly: this can
miss a fuzzy/typo'd match the live search would still surface (no
`word_similarity` fallback), but it will never falsely match something
genuinely unrelated. One notification per matching *user*, not per
matching *saved search*, so a user with several saved searches that all
match the same listing gets one notification, not several. Matching runs
from the `search-indexing` BullMQ job, after `index()` populates
`searchText` — not from `createListing` directly, keeping it off the
synchronous create-listing request path the same way search indexing
itself already is. ~~Known, documented, unaddressed gap: editing a
listing's title/description re-triggers the same job, which can send a
repeat notification for a listing a user was already notified about —
no `(user, listing)` dedup table exists yet.~~ Resolved in Phase 13 —
see the next entry.

## Saved-search notification dedup is keyed by (userId, listingId), not (savedSearchId, listingId)

Phase 12 shipped `notifyMatchingSavedSearches` with the gap noted above:
re-indexing a listing (which also happens on every title/description
edit, not just creation) re-evaluated and re-notified every matching
user with no memory of prior notifications. Phase 13 closes this with a
new `SavedSearchNotification` table, `@@unique([userId, listingId])`,
claimed via an insert-and-catch-`P2002` pattern (the same one already
used in `src/modules/store/store.ts` for slug collisions) immediately
before each `createNotification` call. The dedup key deliberately
excludes `savedSearchId`, and the model has **no relation to
`SavedSearch` at all** — only to `User` and `Listing`, mirroring
`Favorite`'s shape exactly: `deleteSavedSearch` fully removes a
`SavedSearch` row, and if the dedup record cascaded with it, a user with
two saved searches matching the same listing could be re-notified the
moment either search is deleted, even though the notification promise
("you were told about this listing") has nothing to do with which saved
search happened to fire it. The record is permanent (no TTL), matching
`Favorite`'s lifecycle rather than `OtpCode`'s rate-limit-style
expiry — there's no reason a user should be re-notified about the same
listing months later just because time passed.

Rejected alternative: adding a nullable `listingId` column directly to
`Notification` instead of a new table. `Notification` is shared across
seven other `NotificationType`s with nothing to do with a listing/saved-
search relationship (`NEW_ORDER`, `REPORT_RESOLVED`, etc.) — a
dedup-specific column only `search` understands would mix that module's
concern into `notifications`' single write path, which would need
type-conditional logic for a field it otherwise never touches. A
separate table keeps the dedup concept, and its constraint, owned
entirely inside `search`.

## The migration-ordering bug from Phase 12 recurred once, in the very next migration created after the fix

Fixing `docs/DATABASE.md`'s documented Phase 10 migration-ordering bug
in Phase 12 didn't prevent the identical defect from being introduced
moments later in the same session:
`20260829084100_add_saved_search_match_notification_type` (Phase 12's
own `ALTER TYPE` migration, created immediately after the Phase 10 fix)
also sorted before `add_notifications`, the migration that creates the
type it depends on — and this went unnoticed at the time because
`prisma migrate dev`'s shadow-database check, run while *creating* that
migration, only validates the migrations *already on disk* before
computing the diff; it doesn't re-verify the brand-new migration's own
position once written. Caught in Phase 13 by running a bare, no-argument
`npx prisma migrate dev` (which can only report "already in sync" or
fail) as an explicit final check after any migration work, not just
after a rename — fixed the same way as before (`git mv` + update the
`_prisma_migrations` tracking row). See `docs/DATABASE.md` for the full
writeup and the resulting standing rule: a bare `migrate dev` reporting
"already in sync" is now the mandatory last step of any migration
change, not merely a nice-to-have.

## Two Playwright timeout gaps found while validating Phase 13, unrelated to its code changes

Phase 13's e2e validation run hit intermittent failures on specs its
diff never touched (`moderation-flow.spec.ts`,
`pending-review-flow.spec.ts`, `store-management-flow.spec.ts`). Rather
than accept "sandbox flakiness" without checking, each failure was
root-caused before being called environmental: `pgrep -af "next dev"`
ruled out a stray second dev server, a full `npm run build` ruled out a
real type/code regression, and the actual failure snapshots showed the
page still mid "جارٍ التحميل..." (loading) at the moment an assertion
gave up — not stuck, just not finished yet. Two distinct, genuine gaps
in `playwright.config.ts` followed from that evidence, not from
guessing:

1. `expect.timeout` had never been configured, so every
   `toBeVisible()`-style assertion used Playwright's own 5000ms default
   — completely independent of, and far shorter than, the suite's
   already-raised 60s (now 90s) overall per-test `timeout`. An admin
   page's client component fetching its own data after mount, on a cold
   `next dev` compile of both the page route and its API route, can
   exceed 5s even with 55+ seconds of test budget left. Fixed by adding
   `expect: { timeout: 15_000 }`.
2. `store-management-flow.spec.ts` still hit the (already-raised-once,
   Phase 10) 60s overall `timeout` on a slow run. Isolating the spec
   with a temporary 120s ceiling showed it genuinely completing in
   48.3 seconds — slow, not hung — so the global `timeout` was raised
   again, to `90_000`, with margin rather than tuned to the exact
   observed number.

Both are permanent `playwright.config.ts` changes, not one-off retries:
a fixed assertion timeout and test timeout are correctness settings for
this sandbox's real compile-cost profile, not workarounds for a flaky
test. See the inline comments in `playwright.config.ts` for the same
rationale kept next to the settings themselves.

## The real email provider is a generic HTTP POST, not a specific vendor's API

Phase 14 added `EmailProvider` to close the last real notification-
delivery gap (in-app since Phase 7, SMS since Phase 11). The same
reasoning already established for SMS applies unchanged: no email vendor
(SendGrid, Resend, Amazon SES, Postmark, Mailgun, etc.) has been named or
chosen for this project, and guessing one from training knowledge risks
building against an API shape nothing real matches — the exact problem
already flagged for Paymob and repeated for SMS. `package.json` has zero
email SDK dependencies, confirming nothing has been decided yet.
`HttpEmailProvider` (`src/modules/identity/email.ts`) instead POSTs a
vendor-neutral `{ to, subject, text }` JSON body with a bearer token to a
configurable URL (`EMAIL_PROVIDER_API_URL`/`EMAIL_PROVIDER_API_KEY`,
optional everywhere including production, gated the same explicit-
presence check as SMS and Sentry — never the SDK/fetch's own absence-
tolerant behavior). Activating it for a real vendor needs, at most, a
thin adapter in front of that vendor's API satisfying this one contract;
until then, `ConsoleEmailProvider` logs an attempt and does nothing,
exactly like `ConsoleSmsProvider`.

## Email joins SMS as a best-effort mirror on every notification — dispatched concurrently, neither blocks the other

Extends "every notification also gets an SMS attempt — no per-type
allowlist" (above): `createNotification()` now also attempts an email
mirror for every `NotificationType`, with the same "notify everywhere,
narrow later if real usage data ever justifies it" reasoning — curating
a subset today would be an arbitrary judgment call with nothing behind
it. The two channels are dispatched via `Promise.allSettled` around two
independently try/caught async blocks, not run in sequence: a listing
edit, order transition, or moderation action already pays for one inline
network round-trip (SMS) on its request path, and running email
afterward in series would silently double that added latency for zero
benefit, since neither channel's outcome affects the other. A rejection
from either provider is logged and swallowed at its own call site — it
can never suppress the other channel's attempt, and neither can ever
make the in-app `Notification` row (still written first, still the
source of truth) fail to save.

## `User.email` is optional and not unique — a delivery address, never an identity key

`docs/DATABASE.md` has always described `phone` as *the* unique
identifier — Phase 14's `email` field must not quietly contradict that.
It is added as plain `email String?`, with no `@unique` constraint and no
`emailVerifiedAt`. Two considerations drove this, not one: first, a
unique constraint on an auth-adjacent field is exactly the kind of
implicit signal ("this is how the system finds/logs in a user") this
codebase has deliberately kept off `email` by never building it until
now — a shared mailbox across two legitimate accounts (e.g. a small
family shop) should not be structurally impossible for a field that
exists purely for delivery. Second, `emailVerifiedAt` was considered (to
mirror `phoneVerifiedAt`) and rejected for this phase specifically
because no collection-then-verify UI flow exists yet either way — an
always-`null` column with zero write path is the same "looks real, does
nothing" anti-pattern Phase 7's own decision doc rejected for delivery
itself. Both are left for whichever future phase actually builds real
email verification, rather than fabricated ahead of it.

## `createOrder`'s listing reservation was a real, unguarded double-sell race — found and fixed in Phase 15

`createOrder` read a listing (`findFirst({ where: { status: "ACTIVE" } })`),
created an `Order` row, then wrote `listing.update({ data: { status: "SOLD" } })`
— a plain, unconditional update with no guard against what the listing's
status actually was *at the moment of the write*, not just at the moment
of the read. Two concurrent checkouts on the same listing could both pass
the initial read before either wrote, both create their own `Order` row,
and both flip the listing to `SOLD` — two buyers, each believing they
bought the same item, with nothing in the code path ever noticing. The
comment directly above the write already said "reserve the listing
immediately so it can't be sold to two buyers at once," but the code
never actually enforced that atomically — this was a real defect, not a
hypothetical.

Fixed by reordering: the listing is now reserved *before* the order is
created, and both happen inside one `prisma.$transaction`:
`listing.updateMany({ where: { id, status: "ACTIVE" }, data: { status: "SOLD" } })`
followed by `order.create(...)`, with a `listing_already_sold` result
returned if the `updateMany`'s row count is `0`. The `WHERE status:
"ACTIVE"` clause is the actual concurrency control — Postgres serializes
concurrent `UPDATE`s against the same row, so the second writer's
`WHERE` simply no longer matches once the first writer's update commits;
no explicit locking or retry logic is needed. Wrapping the reservation
and the order creation in the same transaction (rather than reserving
first and creating the order as a separate statement) means a failure
creating the order — rare, but possible — rolls the reservation back
too, instead of leaving the listing stuck at `SOLD` with no order to
show for it. `checkout.test.ts` has a regression test that fires two
concurrent `createOrder` calls at the same listing and asserts exactly
one order is created; it reproducibly failed against the old code before
this fix (both calls succeeded) and passes reproducibly now.

`transitionOrder` had the identical shape of bug: read the order, check
`canTransition()` against that read, then write with a plain
`order.update({ where: { id: orderId } })` — no guard against the order's
status having changed between the read and the write. Fixed the same
way, without a transaction this time since there's only one write:
`order.updateMany({ where: { id: orderId, status: order.status }, data })`,
checking the row count before proceeding. This closes two problems at
once: the direct one (two concurrent transitions racing, e.g. a buyer and
an admin both trying to cancel/confirm at the same moment) and a
downstream one — `recordCompletionFinancials` (the function that posts a
`SellerPayout`/`LedgerEntry` on reaching `COMPLETED`) had no idempotency
check of its own, so two concurrent "mark COMPLETED" calls against the
same order could each independently post financial rows for it. The
status-match guard makes a duplicate call fail before it ever reaches
that code, for free — no separate idempotency key needed.

## CI workflow was missing a Redis service — every test/e2e step would have failed to connect

`.github/workflows/ci.yml` set `REDIS_URL: redis://localhost:6379` as a
job-wide env var but never actually started a Redis container — only
`postgres` had a `services:` entry. Every test suite that touches OTP
rate limiting, report rate limiting, or anything BullMQ-backed (which is
most of `tests/` and all of `e2e/`) connects to Redis directly; with none
reachable, `npm test`/`npm run e2e` would fail immediately on the first
Redis call. This went undetected because — as already noted elsewhere in
this repo's history — this workflow triggers only on `push: main`/
`pull_request`, neither of which had happened yet, so it had never
actually run. Fixed by adding a `redis: image: redis:7-alpine` service
block mirroring the existing `postgres` block (same health-check
pattern), matching `docker-compose.yml`'s own Redis image.

## Paymob webhook's `merchant_order_id` extraction is read from two possible locations, not asserted to one

Auditing `PaymobPaymentProvider.verifyWebhook()` (never previously
exercised by any test — see the next entry) turned up an internal
inconsistency: every other field the function reads comes from nested
objects (`obj`, `obj.order`, `obj.source_data`), but the line extracting
the actual order id to update read `merchant_order_id` from the
top-level parsed payload instead. This class's own comment already
states the integration has never been exercised against Paymob's real
sandbox, and this session's attempt to confirm the documented payload
shape against Paymob's live docs was blocked by this environment's
network egress policy — so which location is actually correct in
production could not be confirmed here. Rather than pick one and assert
it with false confidence, the fix checks the nested location first (the
one consistent with everything else this function reads) with a
fallback to the top-level field, so the webhook keeps working regardless
of which shape Paymob's real payload turns out to use. This does not
replace the existing "verify against Paymob's sandbox before going
live" requirement — it just means a wrong guess here won't silently
break payment-status updates in production while that verification is
still pending.

## `payments` module had zero test coverage — added for `CodPaymentProvider`, `getPaymentProvider`, and `verifyWebhook`

Discovered during the same audit as the two entries above: no
`tests/payments/` directory existed at all, meaning the webhook
signature-verification logic above (a financial-state-mutating code
path) had never been exercised by a single automated test, even a
synthetic one requiring no real credentials. `tests/payments/providers.test.ts`
and `tests/payments/paymob-webhook.test.ts` close this gap, the latter
building a synthetic Paymob-shaped payload and computing its HMAC with
the same algorithm `verifyWebhook()` itself uses, so the test is
independent of ever having real Paymob credentials — it validates the
parsing/verification *logic*, not the *real API shape* (that half stays
gated on live sandbox access, per the existing deferred item).

## Stuck `ListingImage`/expired auth rows get a sweep job, mirroring `listing-expiry`'s exact pattern

Phase 16's re-audit (per Phase 15's own instruction to keep re-auditing
rather than trust a prior "nothing left" conclusion) found two real,
previously-flagged-but-unfixed gaps: `processListingImage` has no
`catch` block at all, so a thrown error (a storage failure, `sharp()`
throwing on a corrupt file) exhausts BullMQ's 3 retries and marks the
*job* failed without ever touching `ListingImage.status` — it stays
`PENDING` forever, indistinguishable from "still processing" since every
listing/store/search query filters to `status: "READY"`. Separately,
neither `OtpCode` nor `Session` is ever filtered by expiry at the query
level (`verifyOtp`/`getSessionUser` fetch then reject in application
code), so both grow unbounded.

Both are fixed with a new repeatable BullMQ job each
(`src/jobs/listing-image-sweep.ts`, `src/jobs/auth-row-pruning.ts`),
copying `listing-expiry.ts`'s exact shape rather than inventing a new
pattern: a plain `updateMany`/`deleteMany` sweep function, a dedicated
queue, and a worker registered via `queue.add()` with a fixed `jobId` +
`repeat` option (BullMQ dedupes on that combination, so safe to
re-register on every worker restart). Two deliberate choices worth
recording: (1) a stuck `ListingImage` is marked `REJECTED`, not
re-queued — `REJECTED` is already the terminal state a synchronously-
detected bad file uses, so this needs no schema change and matches the
existing seller-facing "re-upload" UX; re-queuing indefinitely would
risk infinite retries on a permanently-broken file. (2) expired auth
rows are hard-deleted, not moved to a terminal status — unlike
`Listing`/`ListingImage`, nothing reads an expired `OtpCode`/`Session`
for history (`recordAudit` logs auth events separately, with no FK to
`Session`), so there's no soft-fail state worth preserving. Both run
hourly (vs. `listing-expiry`'s 15 minutes) since neither has a
user-facing correctness dependency, only table-bloat/UX-staleness to
bound.

## Listing-image uploads get a size limit, checked before the buffer is loaded

The same Phase 16 audit found a real memory-exhaustion vector:
`requestImageUploadTarget` only validates `contentType`, never size, and
`processListingImage` loads the **entire original into memory as a
Buffer** and runs `sharp()` on it 3× (once per variant) at worker
concurrency 4 — an arbitrarily large upload is a real DoS surface, with
nothing bounding it. `src/modules/store/branding.ts` has had an
equivalent `MAX_UPLOAD_BYTES` check since Phase 4; listing images never
got one. Fixed by adding `getObjectSize(key)` to the `StorageProvider`
interface (`HeadObjectCommand` for R2, `stat().size` for local) and
checking it in `processListingImage` **before** ever calling
`getObject()` — checking after would already have paid the memory cost
of loading the oversized buffer, which is the actual vector being
closed. An oversized original is marked `REJECTED`, the same terminal
state a bad-magic-byte file already uses. The limit is 15 MB (vs.
branding's 8 MB) — generous enough for a real phone-camera photo while
still bounding worst-case per-job memory use; a technical default, not
a product decision. This intentionally stops short of a presigned-POST-
with-conditions upload flow (which would also bound the client-to-R2
PUT itself) — that's a materially bigger change to the upload flow for
marginal additional protection once the worker-side check exists.

## `createListing`'s active-listing-limit race needed a different fix than checkout's

Phase 15 fixed two read-then-write races (checkout's listing
reservation, order transitions) with the same pattern: an `updateMany`
guarded on the row's previously-read status. Phase 16's audit found a
third, real race of a different shape: `createListing` did a plain
`prisma.listing.count()` then a separate `prisma.listing.create()`, with
no transaction between them — two concurrent creates from the same
seller could both read a count below their plan's limit before either
committed, letting a seller exceed their cap. This is a count-then-
create race against an *aggregate*, not a single row's state
transition, so the `updateMany`-guard pattern doesn't apply — there's no
single row whose `WHERE` clause can capture "the count across all this
owner's rows hasn't changed." Fixed instead by wrapping the count check
and the `create` in one `prisma.$transaction` under `Serializable`
isolation, which makes Postgres itself detect a conflicting concurrent
transaction (error `40001`, surfaced by Prisma as `P2034`) rather than
trusting an application-level guard, with a single retry on that
specific error — the standard, sufficient handling for a conflict
that's expected to be rare. Lower stakes than checkout's fix (a seller
temporarily has one extra active listing, not a lost sale), but the
same bug class, left unfixed would have been inconsistent with Phase
15's own conclusion that this class of bug is worth taking seriously
everywhere it appears, not just in the highest-profile instance.

## Three "list my own data" queries were unbounded — paginated to match the rest of the codebase's convention

`listOrdersForBuyer`, `listOrdersForSeller`, and `listListingsByOwner`
were plain `findMany` calls with no `skip`/`take` at all — every other
list query in this codebase (`listNotifications`, search, saved
searches, moderation's report queue, the pending-review queue) already
follows a `{ items, page, totalPages, totalCount }` shape with a
`DEFAULT_LIMIT`/`MAX_LIMIT` clamp. These three were the only holdouts,
found by the same Phase 15/16 audit process, not exploitable
cross-user (each is scoped to the caller's own `buyerId`/`sellerId`/
`ownerId`), but a real, growing performance problem for any long-lived
active account with many orders or listings. Fixed by bringing all
three in line with the established convention exactly — same shape,
same clamp values (20 default / 100 max) already used elsewhere.

The three Server Component pages (`/orders`, `/dashboard/orders`,
`/listings/mine`) needed a page-based pagination control wired to the
URL's `?page=` param, the same UX `/search` already has via
`SearchPaginationClient`. Rather than write three near-identical
one-off wrapper components (that file hardcodes `/search` as the target
path), a single `UrlPagination` component
(`src/components/ui/UrlPagination.tsx`) was added, using
`usePathname()` instead of a hardcoded path so it works for any page.
`SearchPaginationClient`/`/search` were left untouched — the existing,
working pattern didn't need touching just to converge on the new
shared component, and doing so would have been a scope-creeping
refactor of something the task at hand didn't require changing.

The three affected API routes (`/api/orders/buying`,
`/api/orders/selling`, `/api/listings/mine`) changed their response
shape (`{ orders: [...] }`/a bare array → `{ items, page, totalPages,
totalCount }`) as part of this fix. Confirmed via grep this breaks no
existing caller — none of the three routes are actually consumed by
any client-side code in this app today (the corresponding pages are
Server Components calling the module functions directly); they exist
purely as part of the documented API surface for a future mobile
client (see `docs/ARCHITECTURE.md`), which hasn't been built yet.

## Two more unbounded "list my own data" queries found and closed after Phase 17

A follow-up audit (explicitly re-checking rather than trusting Phase
17's own conclusion — the standing lesson from Phases 15-17 is that a
"nothing left" audit has been wrong every time it's been re-checked)
found two more genuinely unbounded queries of the same shape: plain
`listFavoriteListings(userId)` in `src/modules/catalog/favorites.ts`
(behind `GET /api/favorites`, zero UI consumers — same "future API
surface" situation as the three Phase 17 routes) and
`getVerificationRequests(userId)` in
`src/modules/identity/verification.ts` (behind `GET
/api/verification-requests` and consumed directly, unbounded, by
`src/app/profile/page.tsx`). Both were brought in line with the same
`{ items, page, totalPages, totalCount }`/20-default/100-max
convention; `getVerificationRequests`'s sibling in the same file,
`listVerificationRequests` (the admin/moderator queue), already had the
exact shape to mirror.

No pagination UI was added for verification requests specifically — a
user's own request count is structurally bounded to a handful over the
lifetime of an account (there is no realistic path to a "page 2"), so
building `UrlPagination` for it would be over-engineering; the
`/profile` page continues to render the full first page as before. This
is different from favorites, orders, and listings, all of which can
realistically grow unbounded for an active user.

Two further findings from the same audit are deliberately **not**
fixed in this pass, for the same "different risk profile" reason Phase
16 used to defer this exact pagination work in the first place:
`GET /api/admin/shipping-companies` and `GET /api/admin/plans` are
unbounded, but they're small, admin-managed reference tables — a
fundamentally different growth pattern than user-generated "list my own
data," and not a performance risk in practice. `GET /api/admin/ledger`
has a hard `take: 50` cap with no further page beyond the most recent
50 rows — a real gap, but a separate, admin-only concern outside this
audit's scope (user-facing "list my own data" endpoints). Both are
recorded in `PROJECT_STATE.md`'s Known Issues as deferred, not silently
dropped.

## Composite indexes target real filter+sort call sites, not every possible combination

A fresh audit found several high-growth tables (`Order`, `Listing`,
`Favorite`, `VerificationRequest`, `Report`, `LedgerEntry`, `User`)
queried with a filter+sort combination no existing index fully covered
— see `docs/DATABASE.md`'s "Composite Indexes" section for the full
list. Two design choices worth recording:

1. **`Listing`'s public search/browse path got exactly two composites,
   not one per filter combination.** `PostgresSearchProvider` supports
   optional `categoryId`/`governorateId`/`cityId`/price-range narrowing
   on top of a base `status`+`deletedAt` filter, sorted by either
   `createdAt` or `price`. Postgres can only use one composite index
   efficiently per query, so indexing every possible narrowing
   combination would multiply write overhead on every listing
   insert/update for diminishing returns. The two composites added
   (`[status, deletedAt, categoryId, createdAt]` and `[status,
   deletedAt, price]`) cover the two real shapes that matter — default
   recency browse and price-sorted browse — while `governorateId`/
   `cityId` narrowing on top of either is still served adequately by
   the existing single-column `@@index([governorateId])` via a bitmap
   AND when it's actually used.
2. **The old, now-partially-redundant single-column indexes
   (`Order.buyerId`/`sellerId`, `VerificationRequest.userId`, etc.) were
   deliberately left in place, not dropped.** `getUserDetail`
   (`src/modules/identity/admin-users.ts`) does plain equality counts on
   `Order.buyerId`/`sellerId` elsewhere in the codebase — a composite
   index still serves those via its leading column, so nothing breaks —
   but confirming every remaining use of each old index before safely
   dropping any of them is a separate, lower-value cleanup with its own
   small risk of missing an undiscovered call site. Kept this migration
   to pure additions, matching the established "keep it completable in
   one clean pass" scope discipline from Phases 16-19.

No schema-level tests were added for this migration — this codebase has
never unit-tested index existence for any prior migration, and
`EXPLAIN ANALYZE`-based query-plan assertions aren't part of its
established test conventions.

## `requirePrePublishReview` is a non-nullable boolean, not the usual nullable-fails-open pattern

Every other `PlatformSettings` field (`freeListingActiveLimit Int?`,
`paymentProcessingFeeBearer PaymentFeeBearer?`) is nullable, where null
means "the owner hasn't configured this yet" and the code fails open
(no cap, no fee-bearer effect) until it's set. `requirePrePublishReview`
is the first plain boolean in this model, and a boolean has no
meaningful third "unconfigured" state the way a price or an enum does —
it's either on or off. So it's `Boolean @default(false)`, non-nullable,
with `false` (today's existing behavior: publish straight to `ACTIVE`)
as the honest, safe default, rather than forcing a null-check everywhere
it's read for a distinction that can't actually occur. This was asked
of the owner directly (CLAUDE.md Section 7 reserves this kind of
product/velocity trade-off): the answer was to build the technical
capability without flipping the live default — this field and its wiring
are exactly that, no more.

`createListing` reads the setting once, via `getPlatformSettings()`,
outside the `Serializable` transaction that guards the active-listing-
limit count-then-create race (Phase 16). Unlike that count, this is a
simple read of an admin config flag with no concurrent-mutation race to
protect against — there's nothing to retry on conflict for a value one
admin action changes at a time.

`expiresAt` is set immediately at creation regardless of which status
the listing starts at — the same value/timing as today's `ACTIVE` path,
not left null for a `PENDING_REVIEW` listing. This was a deliberate
choice to avoid a real bug: `decidePendingListing`'s `APPROVE` branch
(built in Phase 10 for the report-driven flagging path) never sets
`expiresAt`, because a flagged listing was always already `ACTIVE` (and
therefore already had a real `expiresAt`) before being flagged. A
brand-new toggle-on listing has no such prior value — without setting it
at creation, it would go live via `decidePendingListing` and then never
expire. Setting it immediately means `decidePendingListing`,
`listPendingReviewListings`, and the entire Phase 10 pending-review
queue needed **zero code changes** to correctly handle a listing that
starts life at `PENDING_REVIEW` directly instead of arriving there via a
report — proven by a new regression test that creates a toggle-on
listing, confirms it appears in the queue, approves it, and confirms it
ends `ACTIVE` with a real `expiresAt` intact.

Two Arabic UI strings assumed a listing was previously live before
reaching pending review, which becomes literally false for a first-time
toggle-on submission: the pending-review queue's approve button read
"الموافقة وإعادة النشر" ("approve and **re**-publish") — changed to
"الموافقة والنشر" ("approve and publish"), which reads correctly for
both the report-driven and toggle-on paths. The approval notification
similarly said "...وهو الآن نشط مجددًا" ("...and it is now active
**again**") — the word "مجددًا" (again) was dropped for the same
reason. Both are narrowly caused by this feature, not scope creep.

## A shared rate-limit utility, built for new call sites — the two existing limiters are left untouched

A fresh audit (rate-limiting coverage across mutating endpoints, run
alongside the Phase 20 DB-index audit) found several write endpoints
with zero rate limiting of any kind, despite this codebase already
having two hand-rolled Redis fixed-window limiters:
`requestOtp` (`src/modules/identity/otp.ts`, separate phone/IP windows)
and `createReport` (`src/modules/moderation/reports.ts`, per-reporter,
20/hour). A new shared `checkRateLimit(key, max, windowSeconds)`
(`src/lib/rate-limit.ts`) generalizes the common shape both already use
(`GET` current count → compare to `max` → `INCR`+`EXPIRE` on the
request that's let through) for new call sites.

**`requestOtp`/`createReport` were deliberately left untouched, not
refactored onto the new utility.** Both have compound logic beyond a
single window check: `requestOtp` combines a cooldown key and two
separate window keys (phone, IP) with different thresholds in one
`Promise.all`; `createReport` increments its counter only on the
non-dedupe path, not unconditionally. Forcing either onto a generic
single-key helper would save a couple of lines while risking a subtle
behavior change in already-shipped, already-tested code, for no
functional benefit.

Wired into three genuinely abuse-prone endpoints, found by reading the
actual code (not guessed at):

- **`POST /api/listings` (`createListing`)** — 20 creates/hour/user.
  The only prior guard, `resolveActiveListingLimit()`, counts
  currently-**ACTIVE** listings against a plan cap and fails open when
  unconfigured or on an unlimited plan — a script could create
  unlimited listings with zero throttle before this fix. 20/hour
  mirrors this exact codebase's own `createReport` precedent for the
  same "protect a write path from a scripted loop" concern, generous
  enough for a real bulk-listing session.
- **`POST /api/listings/[id]/images/upload-url`
  (`requestImageUploadTarget`)** — 60/hour/user. Mints presigned
  storage upload URLs with only a content-type check before this fix; a
  scripted loop could generate unlimited presigned URLs, a real
  cost/abuse vector against the storage backend before any file is even
  uploaded.
- **`POST /api/listings/bulk`** — 30/hour/user, checked at the API
  route boundary (`checkBulkActionRateLimit`) rather than inside
  `bulkUpdateListings` itself. `bulkUpdateListings` returns a plain `{
  requested, affected }`, never a discriminated `{success,error}` union,
  and every one of its existing tests asserts that exact shape —
  retrofitting a wrapper just to add a rate limit would force a breaking
  type/test change for zero functional benefit. At up to 100 listing
  IDs per call (the route's own `MAX_BULK_IDS`), 30 calls/hour still
  allows 3,000 row-touches/hour per user, ample for any real inventory
  workflow.

All three threshold values (20, 60, 30 per hour) are technical
anti-abuse defaults reasoned against realistic legitimate usage
patterns — explicitly not CLAUDE.md Section 6 financial/business values,
since they govern infrastructure protection, not pricing or commercial
policy.

**`POST /api/stores` was investigated and confirmed already
sufficiently protected** — `Store.ownerId` is `@unique` in the schema,
so one-store-per-owner is enforced at the database level, not just
application logic. No rate limit was added; see `docs/API.md`.

Deliberately deferred as lower-severity, not fixed this phase: `POST
/api/listings/[id]/favorite` (a cheap toggle bounded to one row per
user/listing — a DB-load concern, not content spam), `POST
/api/saved-searches`, `POST /api/listings/[id]/images/confirm`, `POST
/api/listings/[id]/renew`, and `POST /api/orders` (its `createOrder`
already atomically reserves the listing to `SOLD`, so at most one
successful order can ever exist per listing — the "spam orders against
one listing" attack shape is already naturally capped; a real attack
would need many distinct valid listings, a materially more expensive
and different threat than a bare unrated endpoint suggests).

A separate, fresh IDOR/authorization audit run in the same session
found all 55 API routes correctly enforce ownership or admin/moderator
gating, with CSRF present everywhere it's needed — no gap, not part of
this phase.

## `submitVerificationRequest` dedupes against an already-PENDING request, not just a time-window limit

The same rate-limiting audit found `submitVerificationRequest`
(`src/modules/identity/verification.ts`) was a bare
`prisma.verificationRequest.create` with no dedupe of any kind — a user
with an already-`PENDING` request could submit unlimited additional
requests, flooding the human-reviewed admin queue. A generic time-window
rate limit would only slow this down, not fix the underlying workflow
bug: there is no legitimate reason for a user to have more than one
`PENDING` request open at once.

Fixed with a root-cause dedupe modeled directly on `createReport`'s
existing same-target `OPEN`-report dedupe: `submitVerificationRequest`
now checks for an existing `PENDING` request for the user first, and
returns that request instead of creating a duplicate
(`{ success: true, request, alreadyPending: true }`) rather than
inserting a new row. Unlike `createReport` there's no separate "target"
dimension here (the target is always the requesting user), so any
existing `PENDING` request blocks a new one regardless of `type`.

This changed `POST /api/verification-requests`'s response shape from
the raw Prisma row to `{ request, alreadyPending }`, which required
updating `src/app/profile/ProfileView.tsx`'s submit handler to read the
new shape and to show a "you already have a pending request" message
instead of prepending a visible duplicate row when `alreadyPending` is
`true`.

## Three more audit rounds (IDOR was already clean) — background-job idempotency, Paymob webhook duplicate-processing, notification reliability

Per the standing "keep re-auditing with fresh eyes" precedent (Phases
15-21), three more fresh audit passes ran, covering ground not yet
checked this session. Two came back clean, confirmed by reading the
actual code rather than trusting doc comments:

- **Background-job idempotency**: every repeatable/queued job
  (`listing-expiry`, `auth-row-pruning`, `search-indexing`) is either a
  trivially idempotent guarded `updateMany`/`deleteMany`, or (for
  `search-indexing`'s saved-search-match notifications) protected by a
  real DB unique constraint + `P2002` catch (`claimSavedSearchNotification`),
  not a check-then-act race. Confirmed working as designed.
- **Paymob webhook duplicate-processing**: the webhook's only side
  effect is a single atomically-guarded `updateMany` (`WHERE
  paymentStatus: "PENDING"`) with no separate idempotency-key table
  needed — a second delivery for an already-processed order matches
  zero rows and no-ops, and the route always returns `200` regardless,
  so Paymob won't retry a duplicate-safe no-op as a failure. No
  double-`LedgerEntry`/`SellerPayout` risk, since the webhook itself
  never creates either (those only happen via `transitionOrder`'s own,
  separately-guarded transition).

Two genuine, fixable gaps were found and fixed in this same pass:

1. **Paymob HMAC comparison was not constant-time** (`paymob-provider.ts`).
   A plain `!==` string comparison on a signature check is a — largely
   theoretical, but real and free to fix — timing side-channel. Fixed
   with `crypto.timingSafeEqual`, guarded by an explicit length check
   first (`timingSafeEqual` throws, rather than returning `false`, on a
   length mismatch — an attacker-controlled header of the wrong length
   must never reach it).
2. **`processListingImage`'s three status-setting writes had no state
   guard** (`src/jobs/image-processing.ts`). If the whole worker
   process is down for over an hour with a non-empty image-processing
   backlog (an outage/incident, not an ordinary retry), the
   `listing-image-sweep` job's 1-hour cutoff can flip a backlogged
   row's status to `REJECTED` before its original, never-actually-failed
   job finally runs — and that job would then unconditionally overwrite
   the sweep's `REJECTED` verdict back to `READY` (or `REJECTED` again,
   redundantly). Fixed by changing all three
   `prisma.listingImage.update` calls to `updateMany` guarded on
   `status: "PENDING"`, matching this codebase's established
   guarded-write pattern (order transitions, checkout's listing
   reservation) — a late-finishing job now correctly no-ops once the
   sweep has already decided.

A third, more consequential gap was found in notification delivery,
also fixed:

3. **`createNotification`'s own `Notification`-row write could throw
   past every one of its 4 real call sites** (`checkout.ts`'s
   `createOrder`, `transitions.ts`'s `notifyCounterparty`,
   `reports.ts`'s `resolveReport`, `verification.ts`'s
   `reviewVerificationRequest`) — none of them wraps the call in its own
   try/catch, since the existing doc comment already promised "a
   failure anywhere in this block is logged and swallowed," but that
   promise only actually covered the SMS/email dispatch, not the
   `Notification` row's own `prisma.notification.create()` call. A
   transient DB blip there, arriving after the real business operation
   (an order, a status transition, a report resolution, a verification
   decision) had already committed, would propagate uncaught all the way
   to `withApiHandler`'s generic 500 — reporting a **false failure** to
   the client for an operation that had, in fact, already succeeded,
   while silently losing that one notification with no retry. Fixed by
   wrapping the row creation itself in the same "log and swallow"
   contract already documented and already applied to the SMS/email
   half — `createNotification` now returns `null` (never throws) on a
   DB-write failure. No caller inspects the return value today, so this
   is a non-breaking contract change.

   A related, narrower consequence for the saved-search-match path
   specifically (`notifyMatchingSavedSearches`): its
   claim-then-notify pattern claims a `SavedSearchNotification` row
   *before* calling `createNotification`, and the claim is a permanent,
   non-TTL fact (Phase 13's decision — deleting it on the report-flagging
   analog would reopen the exact repeat-notification bug that pattern
   fixes). Before this fix, a `Notification`-write failure for one
   already-claimed user would throw, fail the whole BullMQ job, and
   trigger a retry that couldn't help that user anyway (their claim
   already exists) while potentially re-running the loop for others.
   After this fix, that same failure is silently swallowed inside
   `createNotification` — the job completes normally, every other
   user in the batch is unaffected, and only that one user's
   notification is lost. This is a strictly more benign failure mode
   than before (no wasted job retries, no risk of the whole job
   cascading into failure), and is accepted as a documented trade-off
   consistent with this codebase's existing "notifications are
   best-effort, never allowed to break something else" design — not
   worth building transactional claim+notify machinery to close a
   narrow, low-severity, silent-loss edge case.

## Phase 23: three more fresh audits (session/cookie security, N+1 queries — both clean) found a real Listing-audit-trail gap in the report-driven moderation path

Continuing the same "keep re-auditing with fresh eyes" precedent, three
more angles not yet checked this session were audited directly against
the code (not trusted from doc comments):

- **Session/cookie security flags**: confirmed clean. The session
  cookie is `httpOnly: true`, `secure` is environment-conditional
  (`NODE_ENV === "production"`), `sameSite: "lax"`, `path: "/"`, and its
  `expires` mirrors the DB-authoritative 30-day `Session.expiresAt`,
  which `getSessionUser` re-validates (along with `revokedAt`) on every
  request, not just at issuance — so even an unexpectedly long-lived
  browser cookie can't outlive server-side revocation. The CSRF cookie
  is deliberately `httpOnly: false`, which is *correct* for this
  double-submit pattern (`src/lib/client-cookies.ts`'s `readCookie`
  reads it via `document.cookie` to echo it back as the `x-csrf-token`
  header) — not an inconsistency with the session cookie's `httpOnly:
  true`. Logout both revokes the session server-side and deletes both
  cookies client-side via Next.js's `cookies().delete(...)`, which
  queues an expired `Set-Cookie` — no stale-cookie-after-logout gap.
- **N+1 query patterns**: confirmed clean across every list-returning
  service function (`listListingsByOwner`, `listOrdersFor{Buyer,Seller}`,
  `listFavoriteListings`, `listUsers`, `listReports`, `listNotifications`,
  `listStorePublicListings`, the search provider's two query shapes) and
  every Server Component page that renders a list — all batch relations
  via Prisma `include`/`select` in the same query, and the one place
  that could plausibly have hidden a per-listing counting loop
  (`getSellerStats`) correctly uses `groupBy`/`aggregate`/`count`
  instead. No page calls an async per-row fetch inside a `.map()`. One
  low-impact aside was noted, not fixed: `notifyMatchingSavedSearches`
  does roughly 2×M extra queries for M matching users on a new listing —
  but it runs off the background search-indexing queue, not a
  user-facing request path, and it's the same intentional per-user
  claim-then-notify design already accepted as a trade-off above; not
  worth batching at the cost of that design's simplicity for a
  background job whose M is realistically small.
- **Admin/moderator audit-log completeness**: this is where the real
  gap was. Every one of the 16 mutating routes under
  `src/app/api/admin/**` does call `recordAudit`, directly or via its
  service function — no route goes completely unaudited. But
  `adminRemoveListing()` and `flagListingForReview()`
  (`src/modules/catalog/listings.ts`), reachable only through
  `resolveReport()` (`src/modules/moderation/reports.ts`), never
  produced a `Listing`-keyed audit row — only the generic
  `admin.report.resolve` entry keyed to the `Report`, which didn't even
  record the listing's id in its metadata. Querying `AuditLog` for
  `targetType: "Listing", targetId: X` — the natural way to answer "what
  happened to this listing and who did it" — returned nothing for a
  report-driven removal or flag, even though a moderator had in fact
  acted on it. This was a real asymmetry within `resolveReport` itself:
  its third dispatchable action, `SUSPEND_USER`, calls `setUserStatus`,
  which *does* self-audit against the `User` it mutates — only the two
  listing-mutating actions were missing the equivalent.

  Fixed by making `adminRemoveListing(listingId, actorId)` and
  `flagListingForReview(listingId, actorId)` self-audit against the
  `Listing`, mirroring `setUserStatus`'s exact pattern (audit inside the
  function that holds the authority, not at the call site) — new
  `admin.listing.remove` / `admin.listing.flag_for_review` actions.
  Both functions gained a required `actorId` parameter (previously
  neither took one, since neither had ever needed to audit). Also added
  `listingId`/`targetUserId` to `admin.report.resolve`'s own metadata,
  so the Report-level entry is self-describing about its target even
  though the authoritative, entity-keyed record now lives on the
  Listing/User itself.

  While in the same file, also closed a smaller, related inconsistency:
  `setUserStatus`'s audit entries (`admin.user.suspend`/`ban`/
  `reactivate`) recorded only the new status, never the previous one —
  unlike `setUserRole` two functions below it in the same file, which
  already captures `{from, to}`. Now `setUserStatus` reads the prior
  status before updating and records `{from, to}` too, so an admin
  escalating `SUSPENDED → BANNED` is distinguishable from `ACTIVE →
  BANNED` directly from the audit log, without needing point-in-time
  reconstruction from elsewhere.

  **Deliberately deferred, not fixed this phase** (real but lower-value,
  and larger in scope — see `PROJECT_STATE.md`'s Known Issues): several
  settings/config-mutation audit entries (`settings.update`, the three
  shipping-company/rate/commission update actions, `subscription_plan.update`,
  `subscription.revoke`) record only the new/submitted values, never the
  prior state, so "what did this setting change *from*" isn't
  reconstructable from `AuditLog` alone (only "what it changed *to*").
  Closing this properly means reading the pre-update row in five
  separate modules (`settings`, `shipping`, `subscriptions`) before each
  write — a real, legitimate improvement, but a distinctly bigger and
  separate unit of work than the single, clearly-scoped Listing-audit
  gap this phase closes, and not the highest-value item found this
  round. `admin.verification.approve`/`reject`'s metadata also doesn't
  mirror the reviewer's `notes` text — same reasoning, deferred.

## Phase 24: two more fresh audits (CSRF coverage, frontend authorization leaks) — both fully clean, the second consecutive clean round this session

Continuing the same precedent, the two remaining candidates named in
Phase 23's Exact Next Action were audited exhaustively (not
spot-checked):

- **CSRF coverage**, across all 40 `route.ts` files under
  `src/app/api/**` with a mutating handler, not just a sample. 37
  correctly call `assertCsrf(request)`; the 3 that don't are each
  legitimately exempt (Paymob's HMAC-authenticated webhook; the OTP
  request/verify endpoints, which run before a session — and its CSRF
  cookie — exists, an inherent exemption for login endpoints under a
  double-submit scheme; and the dev-only local-storage stub, which has
  no session auth at all and is hard-disabled in production). No gap.
- **Frontend authorization-assumption leaks**: every admin page either
  does its own explicit `requireAdmin()`/`requireModerator()` check
  server-side, is covered by the shared layout's server-side
  `requireModerator()` gate (which runs ahead of any child render) plus
  independently-gated API routes, or both. Every client-side role check
  that only drives button visibility is backed by an equivalent
  server-side check on the actual mutating route. Every Server
  Component sends a Prisma-`select`-scoped projection to its client
  component, never a full row gated only by a client-side conditional.
  No gap.

This is the **second consecutive fully-clean audit round** this
session (the first being background-job idempotency + Paymob webhook
duplicate-processing, part of Phase 22's audit set) — a different
signal than Phases 15-23, where nearly every fresh angle found
something real. Recorded as a deliberate inflection point in
`PROJECT_STATE.md`'s Exact Next Action: the project's own history means
this is not proof nothing remains, but it is evidence that the most
obviously-exploitable security-shaped technical gaps (auth, IDOR, CSRF,
session/cookie handling, rate limiting, races, audit-trail
completeness, N+1s, frontend leaks) are largely closed, and a future
session's next unit of work may more likely be a product feature than
another security audit angle — though a fresh audit should still open
every session, per CLAUDE.md Section 1.

One trivial, non-blocking nit was found and deliberately not fixed:
`getUserDetail()` (`src/modules/identity/admin-users.ts`) does an
unscoped `prisma.user.findUnique`, serializing a few extra
low-sensitivity fields (`email`, `phoneVerifiedAt`, `deletedAt`,
`updatedAt`) into the admin user-detail API response beyond what
`UserDetail.tsx` reads. Data-minimization hygiene, not an authorization
gap — the endpoint is already correctly restricted to moderators/
admins. Not worth a dedicated validate/commit/merge cycle on its own;
deferred to whenever that file is next touched for another reason.

## Phase 25: `getUserDetail()` scoped to an explicit `select` — the owner explicitly requested this specific fix

Per the owner's explicit, narrow request, `getUserDetail()`'s
`prisma.user.findUnique` now has an explicit `select` covering exactly
the 7 fields `UserDetail.tsx` reads (`id`, `name`, `phone`, `role`,
`status`, `commerceVerifiedAt`, `createdAt`), removing `email`,
`phoneVerifiedAt`, `deletedAt`, and `updatedAt` from the
`GET /api/admin/users/[id]` response. No other code reads
`getUserDetail`'s return type (confirmed via grep), so this is a pure
narrowing with no breaking change to the one real caller. No business
logic, authorization, or schema change — data-minimization hygiene
only, matching the nit's original characterization above (which is now
struck through in `PROJECT_STATE.md`'s Known Issues rather than
removed, per this repo's established resolved-item convention).
