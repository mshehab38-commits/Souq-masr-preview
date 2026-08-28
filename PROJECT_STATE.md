# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory.

Last updated: 2026-08-28 (Phase 5 blocked pending owner financial decisions)

## Current Status

**Phase 4 (Seller Dashboard, Stores & Inventory Management) is COMPLETE, validated, committed, and pushed.** Code state is unchanged since that push — this update is documentation-only.

Branch: `claude/souq-masr-production-plan-g38qwv`
Latest commit: `0d2bb0e` — "Record Phase 4 commit hash in PROJECT_STATE.md"

**Phase 5 (Orders/Checkout) implementation is explicitly BLOCKED.** The
owner asked to see all financial/commercial decisions Phase 5 depends on
*before* any Phase 5 code is written, per the standing rule that the
engineer must never invent a financial value. No Phase 5 schema, module,
route, or page has been started. See "Phase 5 Blocking Decisions" below
for the full list awaiting owner sign-off, and the chat transcript around
2026-08-28 for the complete decision write-up (options, impact, storage
needs, and RECOMMENDATION-ONLY engineering suggestions for each).

## Phase History

| Phase | Description | Commit(s) | Status |
|---|---|---|---|
| 0 | Original prototype upload (`tamam-standalone.html`) | `280ef92` | Superseded, file retired in Phase 3 |
| 1 | Next.js/Prisma/Postgres/Redis foundation, catalog shell, geo/category seed | `51fddc1` | Done |
| 1B | Design system (teal/amber brand, UI primitives, RTL) | `c92e495` | Done |
| 2 | Phone-OTP auth, sessions, RBAC, verification requests, audit log | `9e3539e` | Done |
| 3 | Listings, images (storage + processing pipeline), search, favorites | `e2bcff8`, `d69b031` | Done |
| 4 | Seller dashboard, stores, bulk listing management, expiry sweep | `0185481` | **Done** |
| 5–11 | Orders, Payments, Shipping, Trust & Safety, Admin, Notifications, Observability/Launch (original 11-phase roadmap) | — | Not started |

## What Was Completed in Phase 4

- **`Store` data model**: one optional public storefront per seller
  (`ownerId` unique — individual and business sellers alike, not gated to
  `BUSINESS` role), globally unique server-generated `slug`, `name`,
  `description`, `logoUrl`, `coverUrl`. Migration
  `20260828160000_add_stores`. No pricing/subscription fields — a free
  branding surface in this phase (see `docs/DECISIONS.md`).
- **`store` module** (`src/modules/store/`): `createStore`, `updateStore`,
  `getStoreByOwnerId`, `getStoreBySlug`, `listStorePublicListings`
  (queries `Listing` by `ownerId` + `status=ACTIVE`, no `storeId` FK
  needed given the 1:1 relationship), `generateStoreSlug` (ASCII base +
  random 8-hex suffix, Arabic-safe fallback), `uploadStoreBranding`
  (synchronous resize/re-encode via `sharp`, reusing `StorageProvider`
  and the listing pipeline's magic-byte check — not queued through
  BullMQ, unlike listing photos).
- **Bulk listing management** (`src/modules/catalog/listings.ts`):
  `bulkUpdateListings(ownerId, listingIds, action)` for `mark_sold` /
  `delete` / `relist`, every action scoped to the caller's own listings
  in the `WHERE` clause itself; `renewListing` for reviving an
  `ACTIVE`/`EXPIRED` listing; `getSellerStats` (active/sold/expired
  counts, total views, favorites received) for the dashboard.
- **Listing expiry**: `createListing` now actually sets `expiresAt`
  (`LISTING_LIFETIME_MS`, 60 days — a technical default, not a pricing
  decision) — this field existed since Phase 3 but nothing populated it
  until now. A new `listing-expiry` BullMQ repeatable job
  (`sweepExpiredListings`, every 15 minutes) flips `ACTIVE` listings past
  `expiresAt` to `EXPIRED`; search already filters to `status=ACTIVE` at
  query time, so no re-indexing step is needed on expiry.
- **API routes**: `POST /api/stores`, `GET/PATCH /api/stores/mine`,
  `POST /api/stores/mine/branding?kind=logo|cover`, `GET
  /api/stores/[slug]`, `POST /api/listings/bulk`, `POST
  /api/listings/[id]/renew`.
- **Pages**: `/dashboard` (seller stats + store CTA + quick links),
  `/dashboard/store` (create/edit store + branding upload via
  `StoreSettingsForm.tsx`), `/store/[slug]` (public storefront with
  branding header + paginated active-listing grid), `/listings/mine`
  gained bulk-select checkboxes (`MyListingsClient.tsx`) wired to the new
  bulk endpoint. `SiteHeader` gained a "لوحة التحكم" (Dashboard) link.
- **Refactor**: extracted the `csrfHeaders()` helper (previously
  duplicated in `ListingDetailActions.tsx` and `ListingImageUploader.tsx`)
  into `src/lib/csrf-headers.ts`.

## Database

- 6 migrations applied, schema at `prisma/schema.prisma` (~345 lines).
  See `docs/DATABASE.md` for full entity documentation, including the new
  `Store` entity and `Listing.expiresAt` lifecycle.

## Tests & Results (last run: this session, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (120 modules, 338 dependencies).
- `npm test` — **103/103 unit tests passing** across 17 files (added:
  `tests/store/slug.test.ts`, `tests/store/store.test.ts`,
  `tests/catalog/bulk-actions.test.ts`, `tests/jobs/listing-expiry.test.ts`).
- `npx playwright test` — **3/3 e2e specs passing**: `auth-signup.spec.ts`,
  `listing-search-flow.spec.ts`, and new `store-management-flow.spec.ts`
  (create store → view public storefront → bulk-mark-sold → confirm the
  listing drops off the storefront).
- `npm run build` — clean production build (34 routes, up from 21).
- Manual end-to-end verification via curl + a real browser: store
  creation, logo/cover upload, public storefront rendering (with the
  actual uploaded image), bulk mark-sold, relist, and renew all confirmed
  working against the real dev DB before writing automated tests.

## Known Issues

### Fixed this session

- **`src/worker.ts` crashed silently on startup after adding the third
  worker.** Using a top-level `await` to start `createListingExpiryWorker()`
  (which itself awaits a `queue.add()` call) compiled fine under `tsc`
  but crashed at runtime: `tsx` transpiles this entrypoint to CJS (no
  `"type": "module"` in `package.json`), and esbuild's CJS output
  doesn't support top-level `await`. Because `e2e/global-setup.ts` spawns
  the worker with `stdio: "ignore"`, the crash was invisible — it
  surfaced only as `listing-search-flow.spec.ts` timing out waiting for
  an image-processing job that was never actually running (the
  previously-passing Phase 3 e2e test started failing again as a
  regression from this session's changes). Root-caused by running `npm
  run worker` directly, which showed the `ERR_REQUIRE_ASYNC_MODULE` error
  immediately. **Fix**: wrapped all startup logic in `async function
  main()` called with `.catch()`. Verified via direct `npm run worker`
  run (starts cleanly, logs "Workers started") and the full Playwright
  suite going back to 3/3 passing. See `docs/DECISIONS.md` for the full
  writeup and the general lesson for any future `tsx`-run entrypoint.

### Open

- None currently known.

## Technical/Architecture Decisions (Phase 4)

See `docs/DECISIONS.md` for full rationale. Summary:

- Store slugs always get a random suffix (never an incrementing counter)
  since Arabic store names often have no ASCII content to build a
  meaningful slug from anyway.
- Branding image uploads are synchronous (not queued through BullMQ),
  unlike listing photos — low volume, and the settings page needs the
  result immediately.
- `worker.ts` must wrap startup in an async function, never use
  top-level `await` — `tsx`'s CJS transpilation of entrypoints doesn't
  support it, and the failure mode is silent under how `global-setup.ts`
  spawns it.
- Storefronts carry zero pricing/subscription fields by design — a free
  feature in this phase, with paid tiers (if ever wanted) deferred to a
  future phase with its own OWNER DECISION REQUIRED items.

## OWNER DECISION REQUIRED — Phase 5 Blocking Decisions

Phase 4 itself introduced no financial logic (storefronts are free; the
60-day listing lifetime is a technical/UX default, not a monetization
lever). Phase 5 (Orders/Checkout) is different: the `Order` schema and
state machine cannot be designed correctly without these decisions —
building it on invented placeholder values would mean a breaking
migration and reconciliation mess once real values are set. **None of
the 9 items below have been decided. No Phase 5 code exists.** Full
option/impact/storage/recommendation write-up for each was delivered in
chat on 2026-08-28 — this table is the tracking summary, not a
replacement for that detail.

| # | Decision | Blocks Phase 5? | Status |
|---|---|---|---|
| D1 | Commission rate structure (% and/or scope: global/category/tier) | Yes | Awaiting owner |
| D2 | Additional fixed platform fee (on top of/instead of commission %) | Yes | Awaiting owner |
| D3 | Seller payout mechanics (minimum threshold, payout schedule/method) | Yes | Awaiting owner |
| D4 | Settlement timing / holding period after delivery | Yes | Awaiting owner |
| D5 | Payment processing fee treatment (platform/seller/buyer absorbs it) | Yes | Awaiting owner |
| D6 | Shipping fee structure for `PLATFORM_SHIPPING` orders | Yes | Awaiting owner |
| D7 | Cancellation fee policy (buyer-initiated / seller-initiated) | Yes | Awaiting owner |
| D8 | Refund fee treatment (is the processing fee/commission refunded too) | Yes | Awaiting owner |
| D9 | Taxes/VAT treatment on commission — **recommend involving a tax advisor** | Yes | Awaiting owner |
| D10 | Subscription pricing (paid store/seller tiers) | No — deferrable | Not urgent |
| D11 | Promoted listing pricing (paid boosted placement) | No — deferrable | Not urgent, future phase |

Engineering has NOT chosen or defaulted any of D1–D9 in code. Nothing in
the repository currently reflects a commission rate, fee amount, payout
schedule, shipping fee, cancellation/refund policy, or tax rate — those
concepts don't exist anywhere in the schema yet, by design, until D1–D9
are answered.

## Blockers

**Phase 5 implementation is blocked** on the owner deciding D1–D9 above.
This is the only blocker; there is no technical obstacle. D10/D11 do not
block Phase 5 and can be decided whenever convenient.

## Exact Next Action

1. **Wait for the owner to answer D1–D9** (D10/D11 optional, can be
   answered later). No Phase 5 schema/module/route/page work starts
   before that.
2. Once answered: record the exact chosen values/structures in this file
   under a new "Phase 5 Financial Configuration" section and in
   `docs/DECISIONS.md`/a new `docs/PAYMENTS.md` or `docs/ORDERS.md` as
   appropriate, encode them as configurable settings (never hardcoded
   literals) per the standing rule, then begin Phase 5 design/
   implementation: `Order` schema with commission/fee snapshot fields,
   the state machine (Pending→Confirmed→Preparing→Ready for Pickup→
   Picked Up→In Transit→Out for Delivery→Delivered→Completed, plus
   Cancelled/Failed/Returned/Refunded/Disputed), checkout flow from a
   commerce-enabled listing, and a seller payout ledger.
3. Read this file + `docs/*` fresh at the start of that session (don't
   rely on conversation memory) and confirm current git state matches
   this document before writing any code.
