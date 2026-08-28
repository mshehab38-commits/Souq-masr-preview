# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory.

Last updated: 2026-08-28 (Phase 3 completion)

## Current Status

**Phase 3 (Listings, Categories, Images & Search) is COMPLETE and pushed.**

Branch: `claude/souq-masr-production-plan-g38qwv`
Latest commit: `e2bcff8` — "Phase 3: listings, categories, images, and search"

Per the approved execution rule (one phase at a time, stop and wait for
explicit approval before starting the next major phase), **this session is
now stopped, awaiting approval to begin Phase 4** (Seller Dashboard, Stores
& Inventory Management).

## Phase History

| Phase | Description | Commit(s) | Status |
|---|---|---|---|
| 0 | Original prototype upload (`tamam-standalone.html`) | `280ef92` | Superseded, file retired in Phase 3 |
| 1 | Next.js/Prisma/Postgres/Redis foundation, catalog shell, geo/category seed | `51fddc1` | Done |
| 1B | Design system (teal/amber brand, UI primitives, RTL) | `c92e495` | Done |
| 2 | Phone-OTP auth, sessions, RBAC, verification requests, audit log | `9e3539e` | Done |
| 3 | Listings, images (storage + processing pipeline), search, favorites | `e2bcff8` | **Done** |
| 4 | Seller Dashboard, Stores & Inventory Management | — | Not started |
| 5–11 | Orders, Payments, Shipping, Trust & Safety, Admin, Notifications, Observability/Launch (see original 11-phase roadmap agreed in plan mode) | — | Not started |

## What Was Completed in Phase 3

- **Catalog module** (`src/modules/catalog/`): listing CRUD
  (`listings.ts`), data-driven attribute validation against
  `CategoryAttribute` rows (`attributes.ts`), commerce-eligibility
  resolution (`commerceEligibility.ts`), Arabic search-text normalization
  (`search-text.ts`), image upload/confirm/delete (`images.ts`),
  favorites (`favorites.ts`). All re-exported through `service.ts` per the
  module-boundary convention (dependency-cruiser enforced).
- **Search module** (`src/modules/search/`): `SearchProvider` abstraction
  with a `PostgresSearchProvider` implementation using `pg_trgm`
  `word_similarity()`/`<%` for substring-aware Arabic fuzzy matching.
  Page-based pagination (matches the existing `Pagination` UI component).
- **Storage abstraction** (`src/lib/storage/`): `StorageProvider`
  interface, `R2StorageProvider` (S3-compatible, presigned URLs),
  `LocalStorageProvider` (filesystem, dev/test only — hard-disabled when
  `NODE_ENV === "production"`). Provider selection in `index.ts` is gated
  on `NODE_ENV === "production"`, not merely on whether `STORAGE_*` env
  vars are present (see Known Issues — Fixed, below).
- **Image processing pipeline** (`src/jobs/`, `src/worker.ts`): BullMQ
  queues for image processing (magic-byte validated, EXIF/GPS stripped,
  WebP original + thumbnail generated via sharp) and search indexing, run
  by a standalone worker process (`npm run worker`) separate from the
  Next.js app.
- **API routes**: `/api/listings` (CRUD, `/mine`, `/[id]/sold`,
  `/[id]/favorite`), `/api/listings/[id]/images/{upload-url,confirm}` and
  `/[imageId]` (delete), `/api/favorites`, `/api/search`,
  `/api/uploads/local/[...path]` (dev-only local file serving).
- **Pages**: `/listings/new` (dynamic per-category attribute form),
  `/listings/[id]` (detail + image uploader + owner actions),
  `/listings/mine`, `/search` (with pagination), shared `SiteHeader`, and
  an updated home page showing real recent listings. Root layout is now
  async to render the header.
- **Data model**: `Listing`, `ListingImage`, `Favorite`, `SavedSearch`
  added to `prisma/schema.prisma`; `Category.commerceDefault` field
  added. Two migrations: `20260828100000_add_listings_media_search`,
  `20260828101500_add_category_commerce_default`.
- **`tamam-standalone.html` retired** — the app's own pages now cover its
  functionality, per the plan's condition for removing it.

## Database

- 5 migrations applied, schema at `prisma/schema.prisma` (see
  `docs/DATABASE.md` for full entity documentation).
- Seed data: 27 governorates, 81 cities, 16 categories with
  `commerceDefault` set (`prisma/geo-data.ts`, `prisma/category-data.ts`,
  `prisma/seed.ts`).

## Dependencies Added in Phase 3

- `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` — R2/S3-compatible
  object storage.
- `sharp` — image processing (resize, format conversion, EXIF stripping).
- New npm script: `worker` (runs `src/worker.ts` via `tsx`).

## Tests & Results (last run: this session, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (102 modules, 259 dependencies).
- `npm test` — **81/81 unit tests passing** across 13 files (catalog,
  identity, search, jobs, components, env, geo/category data).
- `npx playwright test` — **2/2 e2e specs passing**: `auth-signup.spec.ts`
  (Phase 2 golden path), `listing-search-flow.spec.ts` (Phase 3: create
  listing → upload image → image processed to READY with thumbnail →
  findable via search).
- `npm run build` — clean production build (21 routes).

## Known Issues

### Fixed this session

- **Storage provider silently used fake R2 in dev, breaking image
  uploads.** `getStorageProvider()` (`src/lib/storage/index.ts`) selected
  `R2StorageProvider` whenever all `STORAGE_*` env vars were *present*,
  without checking `NODE_ENV`. Since `.env` carries placeholder
  `STORAGE_*` values (added so `next build`'s forced
  `NODE_ENV=production` passes env validation locally), this made `next
  dev` and the e2e suite try to `PUT` uploads to a non-resolvable
  placeholder R2 hostname — the request hung/failed silently, so
  `confirmImageUpload` never ran and no `ListingImage` row was ever
  created. Root-caused via a manual Playwright repro with
  request/response logging (not just `requestfailed`, which only catches
  network-level failures, not bad hostnames resolving to nothing usefully
  observable in time). **Fix**: provider selection now also requires
  `env.NODE_ENV === "production"`, mirroring how `LocalStorageProvider`
  already hard-disables itself in production. Verified via full manual
  repro (upload-url → local PUT → confirm all succeed) and the full
  e2e suite.

### Open

- None currently known.

## Technical/Architecture Decisions (Phase 3)

See `docs/DECISIONS.md` for full rationale. Summary:

- Storage, search, and (from Phase 2) SMS are all behind provider
  interfaces so implementations can change without touching callers.
- Listing writes enqueue an async search-indexing job rather than
  computing `searchText` inline, keeping the write path fast and the
  indexing logic swappable.
- Commerce eligibility is resolved server-side only
  (`resolveCommerceEligibility`), from `Category.commerceDefault` +
  `User.commerceVerifiedAt` + the listing's own `commerceEnabled`/
  `fulfillmentMode` fields — never trusted from the frontend, per the
  hybrid per-listing commerce model the user specified.
- Category attributes are fully data-driven (`CategoryAttribute` rows
  drive both Zod validation and dynamic form rendering) — zero
  hardcoded per-category UI or validation code.

## OWNER DECISION REQUIRED

None yet. Phase 3 introduced no pricing, fee, commission, subscription,
or other financial/commercial logic — `Listing.price` is a seller-entered
value, not a platform-set one. The first OWNER DECISION REQUIRED items
are expected in Phase 5 (Orders/Checkout — commission %, seller
settlement %) and Phase 7 (Payments — payment provider fees) per the
original roadmap.

## Blockers

None. Ready to proceed to Phase 4 pending explicit approval.

## Exact Next Action

**Wait for explicit user approval before starting Phase 4** (Seller
Dashboard, Stores & Inventory Management), per the standing execution
rule. Once approved: read this file + `docs/*` fresh (don't rely on
conversation memory), confirm current git state matches this document,
then begin Phase 4 design/implementation.
