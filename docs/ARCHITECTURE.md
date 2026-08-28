# Architecture

## Style: Modular Monolith

Souq Masr is one deployable Next.js application, not microservices — per
the explicit requirement to avoid microservices overhead while still
keeping strict internal boundaries that would let pieces be extracted
later if the platform's scale ever demanded it.

Business logic lives under `src/modules/<domain>/`. Each module exposes
exactly one public surface: `service.ts` (a barrel re-exporting whatever
that module wants to expose). Everything else inside the module —
individual files like `listings.ts`, `attributes.ts`,
`commerceEligibility.ts` — is private to the module.

This is enforced mechanically, not by convention alone:
`.dependency-cruiser.cjs` defines a forbidden rule that blocks any import
of `src/modules/<x>/<anything other than index.ts or service.ts>` from
outside module `<x>`. `npm run boundaries` runs this check; it's wired
into CI. As of Phase 3: 102 modules, 259 dependencies, zero violations.

Modules as of Phase 4:

- `src/modules/identity/` — auth, sessions, RBAC, phone verification
  (Phase 2).
- `src/modules/catalog/` — listings, categories, attributes, commerce
  eligibility, images, favorites, bulk listing actions, seller stats
  (Phases 1, 3 & 4).
- `src/modules/search/` — the `SearchProvider` abstraction and its
  Postgres implementation (Phase 3).
- `src/modules/store/` — seller storefronts: profile, branding upload,
  public listing feed (Phase 4).

Cross-cutting concerns that don't belong to one domain live in `src/lib/`
(`env`, `db`, `redis`, `queue-redis`, `logger`, `storage/`, `audit`,
`request`, `cookie-names`, `client-cookies`, `csrf-headers`) and are
importable from anywhere, including from inside modules.

## Provider Abstraction Pattern

Every external integration point is defined as a TypeScript interface
with a factory function (`getXProvider()`) that picks an implementation
based on environment/config, so swapping the underlying service never
touches call sites. Established in Phase 2 (SMS) and Phase 3 (storage,
search); the same pattern is planned for Shipping and Payments in later
phases.

| Abstraction | Interface | Implementations | Selection |
|---|---|---|---|
| SMS | `SmsProvider` | `ConsoleSmsProvider` | Always console-log in this phase (no real SMS integration yet) |
| Storage | `StorageProvider` | `R2StorageProvider`, `LocalStorageProvider` | `NODE_ENV === "production"` **and** all `STORAGE_*` vars set → R2; otherwise Local (see `docs/DECISIONS.md` for why this gate exists) |
| Search | `SearchProvider` | `PostgresSearchProvider` | Only one implementation today; the interface is deliberately shaped so an OpenSearch/Elasticsearch implementation can be added later without changing `src/app/api/search/route.ts` |

Future phases add `PaymentProvider` (Paymob first, Fawry later) and a
shipping-provider abstraction (never hardcoding a single logistics
company) on the same pattern.

## Request Flow (typical write)

1. Next.js Route Handler (`src/app/api/.../route.ts`) — parses/validates
   the request (Zod schema), enforces CSRF (`assertCsrf`) and auth
   (`getCurrentUser()`), and does *no* business logic itself.
2. Module service function (e.g. `createListing` in
   `src/modules/catalog/listings.ts`) — the actual business logic, DB
   writes via Prisma, and any side effects (enqueueing jobs, audit log).
3. Response — the route handler shapes the service's return value into
   JSON; errors are mapped to HTTP status codes at this boundary, not
   inside the module.

This keeps route handlers thin and business logic testable without an
HTTP layer (all the Phase 3 catalog/search unit tests call module
functions directly, not `fetch()`).

## Background Jobs

Introduced in Phase 3, extended in Phase 4. Three BullMQ queues
(`src/jobs/queues.ts`):

- **`image-processing`** — triggered by `confirmImageUpload()` after a
  client finishes uploading an original image. The worker
  (`src/jobs/image-processing.ts`) downloads the original, validates it
  by magic bytes (never trusts the client's declared `Content-Type`),
  strips EXIF/GPS metadata, and produces WebP thumbnail/medium/full
  variants via `sharp`, then flips the `ListingImage` row to `READY` (or
  `REJECTED` if the file doesn't pass validation).
- **`search-indexing`** — triggered by `createListing`/`updateListing`.
  Recomputes `Listing.searchText` (Arabic-normalized title +
  description) asynchronously, keeping the write path fast and the
  indexing logic swappable independent of the write path.
- **`listing-expiry`** (Phase 4) — a repeatable job (every 15 minutes,
  `LISTING_EXPIRY_SWEEP_INTERVAL_MS`) that flips `ACTIVE` listings past
  `expiresAt` to `EXPIRED` (`sweepExpiredListings`). Registered via
  `queue.add()` with a fixed `jobId` + `repeat` option, which BullMQ
  dedupes on — safe to re-register on every worker-process restart
  without creating duplicate schedulers.

Jobs run in a **separate process** (`src/worker.ts`, started via `npm run
worker`), not inside the Next.js server — so a slow/crashing image job
can never take down request handling, and the worker can be scaled
independently of the web tier later. That entrypoint wraps its startup in
an `async function main()` rather than using top-level `await`: `tsx`
transpiles it to CJS (no `"type": "module"` in `package.json`), and
esbuild's CJS output doesn't support top-level await — it throws
immediately instead of running. This was a real bug found during Phase 4:
`e2e/global-setup.ts` spawns the worker with `stdio: "ignore"`, so the
crash was silent and surfaced only as an unrelated-looking Playwright
timeout (waiting for an image-processing job that was never actually
running).

Two separate Redis (ioredis) connections exist for a subtle reason:
`src/lib/redis.ts` (`maxRetriesPerRequest: 3`) is used for general
caching/rate-limiting, where a bounded retry count is correct; BullMQ
*requires* `maxRetriesPerRequest: null` on the connection it's given
(`src/lib/queue-redis.ts`), or it throws at startup — so the two can't
share one client instance.

## Media & Storage

Production images are **never** stored on the application server's
filesystem — this is a hard requirement, not a preference. The flow:

1. Client requests an upload target: `POST
   /api/listings/[id]/images/upload-url` → `requestImageUploadTarget()` →
   `StorageProvider.getUploadTarget()` returns a presigned PUT URL (R2)
   or a same-origin local route (dev only) plus a generated object key.
2. Client `PUT`s the raw file directly to that URL — the app server never
   sees the image bytes in the R2 path.
3. Client calls `POST /api/listings/[id]/images/confirm` with the key →
   `confirmImageUpload()` creates a `PENDING` `ListingImage` row and
   enqueues the image-processing job.
4. The worker downloads the original from storage, processes it, uploads
   the derived variants, and flips the row to `READY`.

`LocalStorageProvider` exists purely so this entire flow (including the
worker) is exercisable in dev/CI without real object-storage credentials
— it's hard-disabled by a `NODE_ENV === "production"` check in its own
route handler *and* excluded from provider selection in production (see
`docs/DECISIONS.md`), so there is no path by which it can accidentally
serve production traffic.

## Search

`SearchProvider` (`src/modules/search/types.ts`) defines
`search(filters): Promise<SearchResult>` with page-based pagination
(matching the app's existing `Pagination` UI component, a deliberate
consistency choice over cursor-based pagination). `resolveSearchFilters()`
is shared between the API route and tests so filter-parsing logic isn't
duplicated.

`PostgresSearchProvider` is the only implementation today. It uses
`pg_trgm`'s `word_similarity()`/`<%` (not `similarity()`/`%` — see
`docs/DECISIONS.md` for why the difference matters for Arabic text) for
free-text relevance, combined with exact filters (category, governorate,
price range, commerce-enabled) as SQL `WHERE` clauses. The interface is
intentionally free of any Postgres-specific concept so an OpenSearch/
Elasticsearch implementation can be swapped in behind
`getSearchProvider()` later without touching `/api/search` or any UI.

## Frontend

Next.js 15 App Router, React 19, TypeScript, Tailwind. RTL Arabic-first
(see `docs/design-system.md` for the visual language). Server Components
for data fetching (listing detail, search results, profile), Client
Components only where interactivity requires it (the OTP login form, the
listing image uploader, search pagination controls) — kept as small,
leaf components so most of the tree stays server-rendered.

Category-specific listing forms are **not** hardcoded per category: the
new-listing form (`NewListingForm.tsx`) renders fields dynamically from
the category's `CategoryAttribute` rows fetched at request time, and
`validateListingAttributes()` validates against the same rows server-side
— there is no per-category branch anywhere in the codebase.

## Testing

- **Unit/integration** (Vitest): module service functions tested directly
  against the real dev Postgres/Redis (not mocked) — 103 tests across 17
  files as of Phase 4.
- **Component** (Vitest + Testing Library + jsdom): design-system
  primitives snapshot/interaction tests.
- **End-to-end** (Playwright): full golden-path flows through the real
  running app — `auth-signup.spec.ts` (Phase 2),
  `listing-search-flow.spec.ts` (Phase 3: create a listing, upload an
  image, wait for it to process to `READY`, then find it via search), and
  `store-management-flow.spec.ts` (Phase 4: create a store, view it
  publicly, bulk-mark a listing sold, confirm it drops off the
  storefront). `e2e/global-setup.ts`/`global-teardown.ts` spawn and kill a
  real BullMQ worker process for the duration of the suite (via a
  detached process group + PID file, since Playwright's setup/teardown
  don't share process memory), so the image-processing pipeline is
  exercised end-to-end, not mocked.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → module-boundary
check → migrate deploy → migration-drift check → seed → unit tests →
Playwright install → e2e → production build, in that order, against real
Postgres/Redis service containers.
