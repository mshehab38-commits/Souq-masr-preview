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
