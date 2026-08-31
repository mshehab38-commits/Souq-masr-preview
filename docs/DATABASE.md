# Database

PostgreSQL 16, accessed via Prisma 6. Schema source of truth:
`prisma/schema.prisma`. This document explains the *why* behind the
schema; for the literal field list, read the schema file directly.

## Conventions

- **IDs**: `cuid()` everywhere, not auto-increment integers — avoids
  leaking row counts/creation order and works the same whether an ID is
  generated client-side or server-side later.
- **Soft delete**: every mutable entity has `deletedAt DateTime?`. Rows
  are never hard-deleted by application code; queries filter
  `deletedAt: null` explicitly. Introduced in Phase 1 and applied
  consistently since.
- **Money**: `Decimal(12, 2)`, never `Float` — floating point cannot
  represent currency exactly. `Listing.currency` defaults to `"EGP"` but
  is a real column, not a hardcoded assumption, in case multi-currency
  ever matters.
- **Timestamps**: `createdAt` (`@default(now())`) and `updatedAt`
  (`@updatedAt`) on every model that's ever mutated post-creation.
- **`@@map`**: every model maps to a `snake_case` plural table name
  (Prisma model names stay PascalCase/singular for TS ergonomics; SQL
  tables follow SQL convention).

## Migrations

5 migrations as of Phase 3, applied in order:

1. `20260828080902_init` — `Governorate`, `City`, `Category`,
   `CategoryAttribute`, base `Listing` shell.
2. `20260828083441_add_soft_delete_convention` — retrofits `deletedAt`
   onto Phase 1 models.
3. `20260828090000_add_identity_and_audit` — `User`, `OtpCode`,
   `Session`, `VerificationRequest`, `AuditLog`.
4. `20260828100000_add_listings_media_search` — full `Listing` expansion,
   `ListingImage`, `Favorite`, `SavedSearch`, `pg_trgm` extension + GIN
   index on `Listing.searchText`.
5. `20260828101500_add_category_commerce_default` — adds
   `Category.commerceDefault`.
6. `20260828160000_add_stores` — adds `Store` (Phase 4).

### Generating a new migration (non-interactive environments)

`prisma migrate dev` requires an interactive TTY to name migrations and
isn't reliably usable in this environment. The workaround used
throughout this project:

```bash
# 1. Create a throwaway shadow database
psql -c "CREATE DATABASE souqmasr_shadow;"

# 2. Diff current migrations + new schema changes into a SQL file
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url "postgresql://souqmasr:souqmasr_dev_pw@localhost:5432/souqmasr_shadow" \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql

# 3. Drop the shadow database
psql -c "DROP DATABASE souqmasr_shadow;"

# 4. Apply the new migration to the real database
npx prisma migrate deploy
```

CI enforces that `schema.prisma` and the applied migrations never drift
apart: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --exit-code`
fails the build if someone edits the schema without generating a
migration.

### Migration folder names must sort in dependency order — a real bug found in Phase 12

`prisma migrate deploy` (used by CI and any fresh environment) applies
migrations strictly in **lexicographic folder-name order**, not in the
order they were actually created or applied to any existing database. A
migration folder timestamped earlier than one it structurally depends on
(e.g. an `ALTER TYPE ... ADD VALUE` folder named `074331` sorting before
the `CREATE TYPE` folder it needs, named `130000`) will fail on a truly
fresh database — `type "X" does not exist` — even though it applied fine
to a dev database that already had the type from an earlier session.
This is exactly what happened between
`20260829130000_add_notifications` and what's now
`20260829140000_add_listing_review_notification_types` (originally
`20260829074331_...`, renamed to fix this). It went undetected because
neither `migrate dev`'s shadow-database check nor a real deploy had run
against this migration set from empty until Phase 12 (this project's CI
only triggers on `push: main` / `pull_request`, neither of which had
happened since the bad migration was added).

**When creating a migration, verify its folder name sorts after every
migration it structurally depends on** — not just after the previous
migration chronologically. If it doesn't, rename the folder (`git mv`)
and update the corresponding `_prisma_migrations.migration_name` row on
every database that already applied it under the old name, or a fresh
`migrate deploy` will disagree with an existing dev database about
whether it's already applied. `npx prisma migrate dev` against the real
schema (which replays every migration into a shadow database) is the
cheapest way to catch this — run it after any migration-folder rename,
not just after adding a new one.

**Update (Phase 13): the same bug recurred, in the very next migration
created after the fix above.**
`20260829084100_add_saved_search_match_notification_type` (added later
in the same Phase 12 session that fixed the bug above) had the identical
defect against the same `add_notifications` migration, and it went
undetected at the time it was created. The reason is the crucial nuance
the original writeup above missed: **`npx prisma migrate dev` succeeding
while *creating* a new migration only proves the *existing*, already-
on-disk migrations replay cleanly into the shadow database it builds to
compute the diff — it does not re-verify the *brand-new* migration's own
folder name once written.** A migration can be generated with a
perfectly innocent-looking, genuinely-timestamped name (real wall-clock
time, not hand-picked) and still land lexicographically before an
earlier-session migration that used a hand-picked "round" timestamp
(several of this project's earlier migrations, e.g. `130000`, `160000`,
`170000`, were assigned tidy round times rather than genuine
`migrate dev` timestamps, for organization — see the non-interactive
workaround below). Mixing hand-picked and genuine timestamps in the same
history is exactly what created both collisions. Fixed the same way
(rename + update the tracking row), then confirmed with a full,
argument-less `npx prisma migrate dev` (no `--name`, so it can only
report "already in sync" or fail — it does not create anything) that the
*entire* history, all 15 folders, replays cleanly. **That
no-argument, "expect nothing to happen" run is the real verification
step — run it after every migration folder rename, and treat "already in
sync" as the only acceptable result.**

## Entities

### Identity (Phase 2)

- **`User`** — `phone` is the unique identifier (Egyptian E.164, enforced
  at the application layer by `normalizeEgyptianPhone`), not email/
  username. `role` (`INDIVIDUAL`/`BUSINESS`/`MODERATOR`/`ADMIN`) drives
  RBAC. `commerceVerifiedAt` gates whether an *individual* seller (not
  just a business) can enable checkout on a listing — see
  `commerceEligibility.ts`. Phase 14 adds an optional, non-unique
  `email` purely as a notification delivery address — it is never a
  login credential and carries no verification state yet (no
  `emailVerifiedAt`).
- **`OtpCode`** — keyed by `phone`, not `userId`: a code can be requested
  before any `User` row exists, since first-time OTP verification is also
  registration. Only a hash (`codeHash`, mixed with `OTP_PEPPER`) is
  stored, never the plaintext code. Expired rows are excluded at the
  application layer (`verifyOtp` fetches then rejects), not at query
  time — since Phase 16, an hourly `auth-row-prune` job (`src/jobs/
  auth-row-pruning.ts`) `deleteMany`s rows past `expiresAt` so the table
  doesn't grow unbounded.
- **`Session`** — opaque server-revocable tokens; only `tokenHash`
  (SHA-256) is stored, so a database read alone can never yield a usable
  session token. Not JWT — deliberately, so a session can be revoked
  server-side instantly (logout, ban, password/phone change) without
  needing a token blocklist. Same Phase-16 pruning job also deletes
  expired `Session` rows — nothing reads them for history once expired
  (`recordAudit` logs auth events separately, with no FK to `Session`).
- **`VerificationRequest`** — individual/business seller verification
  submissions. Review UI lands in Phase 10 (Admin); the submission path
  exists from Phase 2 so the data model doesn't need to change later.
- **`AuditLog`** — append-only, `actorId` nullable (`SetNull` on user
  deletion, not cascade — audit trail must survive the actor being
  removed) with a separate `actorType` for system-initiated actions.

### Geography (Phase 1)

- **`Governorate`** / **`City`** — seeded once (27 governorates, 81
  cities), not user-editable. `City` is only unique per
  `(governorateId, slug)`, not globally, since city names repeat across
  governorates.

### Catalog (Phase 1 shell, Phase 3 full model)

- **`Category`** — `commerceDefault` (`ELIGIBLE`/`NOT_ELIGIBLE`/
  `ADMIN_REVIEW`) is a *default*, never a permanent lock on listings in
  that category — see Commerce Eligibility below. `deletedAt` rather than
  a hard delete, since existing listings reference categories.
- **`CategoryAttribute`** — one row per data-driven form field
  (`key`, `labelAr`/`labelEn`, `type`, `options` for `SELECT`,
  `required`). Adding a new attribute to a category is a data change, not
  a code change or migration.
- **`Listing`** — the core entity. `attributes` is a `Json` blob of
  `{ [CategoryAttribute.key]: value }`, validated server-side against
  that category's `CategoryAttribute` rows on every write
  (`validateListingAttributes`) — never trusted as-is from the client.
  `searchText` is a precomputed, Arabic-normalized concatenation of
  title + description, kept current by an async BullMQ job
  (`search-indexing.ts`) rather than computed synchronously on write.
  Indexed on `categoryId`, `ownerId`, `status`, `governorateId`, `price`,
  and a GIN `pg_trgm` index on `searchText` for fuzzy search. `expiresAt`
  is set on every create/relist/renew (`LISTING_LIFETIME_MS`, currently 60
  days — a technical default, not a pricing decision) and enforced by the
  `listing-expiry` BullMQ repeatable job (`sweepExpiredListings`, Phase 4),
  which flips `ACTIVE` listings past `expiresAt` to `EXPIRED`. Search
  already filters to `status = 'ACTIVE'` at query time, so an expired
  listing disappears from search the moment the sweep runs — no
  re-indexing step needed.
- **`ListingImage`** — one row per uploaded image. Created in `PENDING`
  status pointing at the just-uploaded `originalKey`; the image-processing
  worker rejects anything over 15 MB before loading it into memory
  (Phase 16), then fills in `thumbnailUrl`/`mediumUrl`/`fullUrl` and flips
  status to `READY` (or `REJECTED` on invalid/corrupt/oversized input)
  asynchronously. `processListingImage` has no `catch` block, so an
  unexpected error (storage failure, `sharp()` throwing) exhausts
  BullMQ's retries without ever touching this row — an hourly
  `listing-image-sweep` job (Phase 16, `src/jobs/listing-image-sweep.ts`)
  is the backstop, flipping anything still `PENDING` past 1 hour old to
  `REJECTED`.
- **`Favorite`** — unique on `(userId, listingId)`.
- **`SavedSearch`** — `query` is a `Json` blob of `RawSearchParams` (the
  slug-based raw params, e.g. `{ q, category, governorate, city,
  minPrice, maxPrice, sort }` — the same shape `/api/search` accepts and
  `resolveSearchFilters` resolves), not the already-resolved
  `SearchFilters` with real category/governorate/city IDs — this keeps a
  saved search stable and independent of any specific database ID.
  Existed since Phase 3 with no implementation at all until Phase 12,
  which added full CRUD (`src/modules/search/saved-searches.ts`, capped
  at 20 per user) plus match-and-notify: the `search-indexing` BullMQ job
  calls `notifyMatchingSavedSearches()` after indexing a new listing,
  which checks every saved search's filters against the listing (a
  cheap field-predicate match, not a live search-engine query — see
  `docs/DECISIONS.md`) and creates one `SAVED_SEARCH_MATCH` notification
  per matching user.
- **`SavedSearchNotification`** (Phase 13) — a permanent dedup record,
  `@@unique([userId, listingId])`, with **no relation to `SavedSearch`
  at all**, only to `User` and `Listing` — mirroring `Favorite`'s exact
  shape. `notifyMatchingSavedSearches()` claims this row (an insert,
  relying on the unique constraint — a caught `P2002` means "already
  notified, skip") immediately before calling `createNotification()`,
  so a listing re-indexed after a title/description edit — the
  `search-indexing` job runs on every edit, not just creation — never
  sends a second `SAVED_SEARCH_MATCH` to the same user about the same
  listing. Deliberately not keyed by `savedSearchId`: `deleteSavedSearch`
  fully removes a `SavedSearch` row, and a `savedSearchId`-keyed dedup
  record would disappear with it, letting a user with a second,
  still-matching saved search get re-notified about a listing they were
  already told about the moment the first saved search is deleted. Never
  expires — same permanent-fact-table lifecycle as `Favorite`, cleaned up
  only via `onDelete: Cascade` on user/listing deletion, unlike the
  TTL-based `OtpCode`/rate-limit keys. See `docs/DECISIONS.md`.

### Seller Storefronts (Phase 4)

- **`Store`** — one optional public storefront per seller (`ownerId`
  unique), available to individual and business sellers alike, not gated
  to `User.role === BUSINESS`. `slug` is unique and globally generated
  (`generateStoreSlug`): an ASCII-reducible base from the store name (or a
  generic `store-` fallback for names that don't reduce to any ASCII/digit
  characters, which is common for Arabic-only names) plus a random 8-hex
  suffix, so slug uniqueness never depends on a read-then-write
  check-and-increment race. `logoUrl`/`coverUrl` point at branding images
  uploaded through the same `StorageProvider` used for listing photos, but
  resized synchronously in the request (`uploadStoreBranding`) rather than
  through the async BullMQ pipeline — branding images are small,
  low-volume, and the settings page needs the result immediately. No
  pricing/subscription fields exist on this model: a storefront is a free
  branding surface in this phase, not a paid tier (that would be a future
  OWNER DECISION REQUIRED item, not something to invent here). A store's
  public listings are resolved by querying `Listing` on `ownerId` +
  `status = 'ACTIVE'` (`listStorePublicListings`) rather than via a
  `storeId` foreign key on `Listing` — the 1:1 owner-to-store relationship
  makes a direct FK unnecessary.

## Commerce Eligibility Model

Deliberately **not** a single flat enum. Three independent signals,
resolved server-side only (`resolveCommerceEligibility()` in
`src/modules/catalog/commerceEligibility.ts`), never trusted from the
frontend:

1. `Category.commerceDefault` — what a *new* listing in this category
   defaults to.
2. `User.commerceVerifiedAt` — whether this *seller* (individual or
   business) has been verified for checkout at all.
3. `Listing.commerceEnabled` + `Listing.fulfillmentMode` — the actual,
   possibly-overridden state of *this* listing (contact-only vs.
   checkout-enabled, and if enabled, who arranges fulfillment).

This lets checkout be enabled per-listing rather than gated at the
account-type level, per the explicit product requirement that checkout
must not be restricted to business/store accounts.

## Extensions

- `pg_trgm` — enables `word_similarity()` and the `<%` operator, used by
  `PostgresSearchProvider` for substring-aware Arabic fuzzy search.
  Enabled via `previewFeatures = ["postgresqlExtensions"]` in the
  generator block and `extensions = [pg_trgm]` in the datasource block —
  Prisma manages the `CREATE EXTENSION` in the relevant migration.

## Financial Architecture (Phase 5)

The owner's approved business model: **zero commission on product
sales**; platform revenue comes only from subscriptions, promoted
listings, and a commission charged *to shipping companies*. The schema
enforces the separation between seller funds and platform revenue
structurally, not just by convention:

- **`PlatformSettings`** — a singleton row (fixed id `"singleton"`,
  lazily created on first read) for cross-cutting config that doesn't
  need its own table: `freeListingActiveLimit` (nullable — null means no
  cap is enforced, never an invented number),
  `paymentProcessingFeeBearer` (nullable enum, irrelevant until a live
  online payment provider exists), and `requirePrePublishReview`
  (Phase 19) — a non-nullable `Boolean @default(false)`, the first plain
  toggle in this model. Unlike the nullable fields above, a boolean has
  no meaningful third "owner hasn't decided yet" state, so it uses an
  honest, safe default (today's existing behavior — publish straight to
  `ACTIVE`) rather than the nullable-fails-open pattern. When set `true`,
  every new listing is created at `PENDING_REVIEW` instead and flows
  through the same admin queue (`listPendingReviewListings`/
  `decidePendingListing`, see below) as a report-driven flag — no
  changes were needed there. See `docs/DECISIONS.md`.
- **`SubscriptionPlan`** — admin-managed, `monthlyPrice`/`yearlyPrice`
  both nullable (a plan with neither set can't be subscribed to — it's a
  named placeholder, not a free trial). Benefit fields
  (`activeListingLimit`, `imageLimitPerListing`,
  `allowPromotedListings`, `priorityPlacement`, `geographicTargeting`,
  `storeFeatures`) are all real, owner-editable columns — never hardcoded
  per-plan assumptions in application code.
- **`Subscription`** — links a `User` to a `SubscriptionPlan`.
  `grantedBy` records which admin granted it, since self-serve online
  purchase isn't wired yet (needs a live payment gateway — see Payments
  below). This is a legitimate interim mechanism for early-stage B2B
  billing (an admin grants a subscription after an offline/manual
  payment arrangement), not a placeholder hack.
- **`ShippingCompany`** — `defaultFlatFee` is the company-wide fallback
  rate, deliberately **not** modeled as a nullable-`governorateId` row in
  `ShippingRate`: Postgres unique indexes treat every `NULL` as distinct,
  so a `(shippingCompanyId, governorateId)` unique constraint could never
  actually enforce "at most one default row per company" that way. This
  was caught during Phase 5 development (TypeScript's compound-key
  typing rejected a `null` `governorateId` in a `where`-unique input
  before it became a runtime bug) and fixed by moving the fallback here.
- **`ShippingRate`** — one row per `(shippingCompanyId, governorateId)`
  pair, `governorateId` and `flatFee` both required. A real, negotiated
  courier price the owner enters — never invented by engineering. A
  company with no rate for a governorate (and no `defaultFlatFee`) is
  simply not offered as a checkout option there.
- **`ShippingCommissionRule`** — one row per company, nullable
  `commissionPercent` (0% until the owner sets a real contracted rate,
  never a guessed percentage). This is Souq Masr's cut, owed **by** the
  shipping company — never deducted from the seller or buyer.
- **`ShippingSettlement`** — a periodic reconciliation
  (`computeSettlementForPeriod`) that sums a company's `COMPLETED`
  orders' `shippingFee`/`shippingCommissionAmount` in a date range and
  posts exactly one `LedgerEntry` for the commission. Kept fully separate
  from seller payouts.
- **`Order`** — one order per checkout on a single commerce-enabled
  listing. Every money field (`productPrice`, `shippingFee`,
  `shippingCommissionAmount`, `paymentProcessingFee`, `totalAmount`) is
  snapshotted at checkout time from whatever's in effect then — never
  re-read live later, so a subsequent price/rate/rule change can never
  retroactively alter an order in flight. `status` drives the full
  lifecycle state machine (see `docs/API.md` and
  `src/modules/orders/state-machine.ts`); `shippingAddress` is a JSON
  snapshot (same pattern as `Listing.attributes`) rather than a separate
  `Address` model, since an order's delivery details must never change
  if the buyer's saved address later does.
- **`SellerPayout`** — `amount` always equals `Order.productPrice`
  exactly (zero commission). For cash-on-delivery orders — the only live
  payment method — no row is created at all: the buyer already paid the
  seller directly, so Souq Masr never held that money and has nothing to
  disburse or report as a liability. Rows only exist for the (currently
  inactive) `ONLINE` payment path.
- **`LedgerEntry`** — the append-only financial audit trail. Every
  caller picks `account` (`PLATFORM_REVENUE` / `SELLER_PAYABLE` /
  `BUYER_REFUNDABLE` / `SHIPPING_COMPANY_PAYABLE`) explicitly rather than
  having it inferred — a bug at a call site (e.g. tagging product-sale
  proceeds as `PLATFORM_REVENUE`) is visible during code review, not
  hidden behind "smart" logic in the ledger itself. `getLedgerSummary()`
  aggregates only `PLATFORM_REVENUE` rows by type — it is structurally
  impossible for a product sale to appear in that total, since nothing
  in the codebase ever writes a product-price `LedgerEntry` tagged
  `PLATFORM_REVENUE`.

### Order lifecycle enum

`OrderStatus`: `PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP →
PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED → COMPLETED`, plus
`CANCELLED` / `FAILED` / `RETURNED` / `REFUNDED` / `DISPUTED` as
alternate/terminal branches. `OrderCancelledBy`
(`BUYER`/`SELLER`/`ADMIN`/`SYSTEM`) records who triggered a cancellation
— `ADMIN` was added in a follow-up migration
(`20260828210000_add_admin_order_cancelled_by`) after a test caught that
the original enum only had three values while the application's actor
model already had four; admin overrides are audit-distinct from
automated `SYSTEM` actions, so they were never meant to be conflated.

## Trust & Safety (Phase 6)

- **`Report`** (migration `20260829120000_add_reports`) — a report
  against either a `Listing` or a `User`, never both. `targetType`
  (`LISTING`/`USER`) selects which of the two nullable FKs
  (`listingId`/`targetUserId`) is populated; a hand-added `CHECK`
  constraint (`reports_target_consistency_check`, appended to the
  migration after Prisma generated the base SQL — Prisma can't express
  "exactly one of two nullable columns" itself) enforces this at the
  database level, not just in application code, the same class of fix as
  the `ShippingRate` nullable-uniqueness issue documented below.
  `reason` is a fixed `ReportReason` enum (`SPAM`/`PROHIBITED_ITEM`/
  `FRAUD_SCAM`/`MISLEADING`/`OFFENSIVE_CONTENT`/`DUPLICATE`/`OTHER`).
  `status` (`OPEN`/`ACTION_TAKEN`/`DISMISSED`) starts `OPEN`;
  `reviewedById`/`reviewedAt`/`resolutionNotes` are populated once a
  moderator resolves it. A reporter can only ever have one `OPEN` report
  against a given target — `createReport()` returns the existing one
  instead of creating a duplicate.
- **`User.role`/`User.status`** — both existed since Phase 2 but were
  never actually set by anything until this phase: `MODERATOR` (a third
  role alongside `INDIVIDUAL`/`BUSINESS`/`ADMIN`) and `SUSPENDED`/
  `BANNED` (alongside `ACTIVE`) are now reachable through
  `/admin/users`. Suspending or banning a user also revokes every
  session they currently hold (`Session.revokedAt`), on top of the
  pre-existing check in `session.ts` that already refuses a non-`ACTIVE`
  user's session lookup — the explicit revocation makes the cutoff
  immediate and auditable rather than relying solely on that check.
- **`ListingStatus.PENDING_REVIEW`/`REJECTED`** — declared since Phase 3,
  unused until Phase 10 (see below); new listings still publish straight
  to `ACTIVE`. `REMOVED` (previously only reachable via a seller's own
  delete) is now also reachable via `adminRemoveListing()`, which is
  deliberately not scoped by `ownerId` since the caller is a moderator,
  not the owner.
- **`VerificationRequest.reviewedBy`/`reviewedAt`** — declared since
  Phase 2, unused until now. `reviewVerificationRequest()` sets them,
  plus `User.commerceVerifiedAt` on approval, and — only for a request
  of type `BUSINESS` where the user's role is still `INDIVIDUAL` — promotes
  `role` to `BUSINESS`. It never touches an `ADMIN`/`MODERATOR` user's
  role, and refuses to re-review an already-decided request.

## Notifications (Phase 7)

- **`Notification`** (migration `20260829130000_add_notifications`) — the
  in-app row is always written; since Phase 11, `createNotification()`
  also attempts a best-effort SMS mirror via the now general-purpose
  `SmsProvider` (`sendMessage`, alongside its original OTP-only
  `sendOtp`) — inert until a real gateway is configured (see
  `docs/DECISIONS.md`). Since Phase 14, it also attempts a best-effort
  email mirror via `EmailProvider` (`sendNotification`) whenever
  `User.email` is set — inert until a real provider is configured, same
  as SMS, and dispatched concurrently with (not blocking, and not
  blocked by) the SMS attempt. `type` is a
  fixed `NotificationType` enum (`NEW_ORDER`/`ORDER_STATUS_CHANGED`/
  `LISTING_REMOVED`/`LISTING_FLAGGED_FOR_REVIEW`/
  `LISTING_REVIEW_DECIDED`/`REPORT_RESOLVED`/`VERIFICATION_REVIEWED`/
  `SAVED_SEARCH_MATCH`).
  `link`, if set, is always
  an in-app path (e.g. `/orders/[id]`) — never an external URL, so
  there's no open-redirect surface through a notification. `readAt`
  starts `null`; `createNotification()` is the single write path, called
  from `orders` (new order → seller; status change → whichever of
  buyer/seller didn't trigger it, or both for an admin/system-driven
  transition), `moderation` (report resolved → reporter; listing
  removed → the listing's owner), and `identity` (verification decision
  → the requesting user).

## Proactive Moderation Queue (Phase 10)

- **`ListingStatus.PENDING_REVIEW`/`REJECTED`** finally get a write path:
  `flagListingForReview()` moves an `ACTIVE` listing to `PENDING_REVIEW`
  (only from `ACTIVE` — flagging an already-sold/expired/removed listing
  isn't a meaningful transition) as a new `resolveReport()` action
  (`FLAG_FOR_REVIEW`, alongside the existing `REMOVE_LISTING`/
  `SUSPEND_USER`) — a reversible, softer escalation than removal for an
  ambiguous report. `decidePendingListing()` resolves it one way or the
  other: `APPROVE` back to `ACTIVE`, `REJECT` to `REJECTED`. Unlike
  `adminRemoveListing`, flagging never touches `deletedAt` — the listing
  is hidden from public view purely through its `status`, so it can be
  restored without the seller re-creating it.
- **`NotificationType`** gained `LISTING_FLAGGED_FOR_REVIEW` and
  `LISTING_REVIEW_DECIDED` (migration
  `20260829074331_add_listing_review_notification_types`) so the seller
  learns their listing was pulled for review, and later learns the
  outcome, the same way they already learn about a removal.
- **`getListingById` visibility gating** (application-layer, not schema):
  a real gap found while building this — the function never filtered by
  status for a non-owner viewer, so a `DRAFT` (or, after this phase,
  `PENDING_REVIEW`/`REJECTED`) listing's ID could be fetched by anyone,
  including through the documented `GET /api/listings/[id]` route, which
  had no auth check at all. Fixed by gating on
  `status IN (ACTIVE, SOLD, EXPIRED)` for any viewer who isn't the
  listing's owner — with a further exception for a `MODERATOR`/`ADMIN`
  viewer, who can see any non-deleted listing regardless of status, since
  moderating `PENDING_REVIEW`/`REJECTED`/`DRAFT` content requires being
  able to look at it.

## Composite Indexes for Filter+Sort Query Shapes (Phase 20)

A fresh audit (migration `20260831192836_add_composite_indexes_for_pagination_queries`)
found several high-growth tables queried with a filter+sort combination
that only single-column indexes covered — fine at today's data volume,
but a real production slowdown as these tables grow, since Postgres can
use a single-column index for the filter but still has to sort the
matching rows in memory afterward. Twelve composite indexes were added,
each targeting a specific, real call site (not speculative combinations):

- **`users_deletedAt_createdAt_idx`** — the admin user directory
  (`listUsers`) filters `deletedAt: null`, sorts `createdAt`. `User` had
  no index at all besides the unique `phone` before this.
- **`verification_requests_userId_createdAt_idx`** /
  **`verification_requests_status_createdAt_idx`** — a user's own
  request history (`getVerificationRequests`) and the admin review queue
  (`listVerificationRequests`) respectively.
- **`listings_ownerId_deletedAt_createdAt_idx`** — the seller's own
  "my listings" dashboard (`listListingsByOwner`).
- **`listings_status_deletedAt_categoryId_createdAt_idx`** /
  **`listings_status_deletedAt_price_idx`** — the two real shapes the
  public search/browse path (`PostgresSearchProvider`) actually uses:
  default browse sorted by recency, and price-sorted browse. This is the
  single most-invoked query in the app (every homepage/category page
  load); deliberately just these two composites, not one per possible
  filter combination — Postgres can only use one composite index
  efficiently per query, and `governorateId`/`cityId` narrowing on top of
  either shape is adequately served by the existing single-column
  `@@index([governorateId])` via a bitmap AND when it's actually used.
- **`favorites_userId_createdAt_idx`** — `listFavoriteListings`. The
  pre-existing `@@unique([userId, listingId])` didn't help here since its
  second key is `listingId`, not `createdAt`.
- **`orders_buyerId_createdAt_idx`** / **`orders_sellerId_createdAt_idx`**
  — `listOrdersForBuyer`/`listOrdersForSeller`.
- **`ledger_entries_createdAt_idx`** / **`ledger_entries_account_createdAt_idx`**
  — `listLedgerEntries`. `LedgerEntry` had no `createdAt` index at all
  before this, so an unfiltered "recent activity" query was a full
  sequential scan even though it's `take`-limited.
- **`reports_status_createdAt_idx`** — the moderation queue
  (`listReports`).

The old single-column indexes these composites partially supersede
(`Order.buyerId`/`sellerId`, `VerificationRequest.userId`, etc.) were
deliberately left in place — `getUserDetail`'s plain equality counts on
`Order.buyerId`/`sellerId` still use them fine via a composite's leading
column, and dropping now-partially-redundant indexes is a separate,
lower-value cleanup out of scope for this pass. See `docs/DECISIONS.md`.

Deliberately **not** indexed this phase (real but lower-value — Tier 3):
the `Listing` pending-review queue (`status, updatedAt` — admin-only, low
volume), `Subscription` (`userId, status, currentPeriodEnd` — small
per-user row count), `ShippingSettlement` (`periodStart` — one row per
company per settlement period, genuinely low volume).
