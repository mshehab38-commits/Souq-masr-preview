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

## Entities

### Identity (Phase 2)

- **`User`** — `phone` is the unique identifier (Egyptian E.164, enforced
  at the application layer by `normalizeEgyptianPhone`), not email/
  username. `role` (`INDIVIDUAL`/`BUSINESS`/`MODERATOR`/`ADMIN`) drives
  RBAC. `commerceVerifiedAt` gates whether an *individual* seller (not
  just a business) can enable checkout on a listing — see
  `commerceEligibility.ts`.
- **`OtpCode`** — keyed by `phone`, not `userId`: a code can be requested
  before any `User` row exists, since first-time OTP verification is also
  registration. Only a hash (`codeHash`, mixed with `OTP_PEPPER`) is
  stored, never the plaintext code.
- **`Session`** — opaque server-revocable tokens; only `tokenHash`
  (SHA-256) is stored, so a database read alone can never yield a usable
  session token. Not JWT — deliberately, so a session can be revoked
  server-side instantly (logout, ban, password/phone change) without
  needing a token blocklist.
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
  worker fills in `thumbnailUrl`/`mediumUrl`/`fullUrl` and flips status to
  `READY` (or `REJECTED` on invalid/corrupt input) asynchronously.
- **`Favorite`** — unique on `(userId, listingId)`.
- **`SavedSearch`** — `query` is a `Json` blob of the search filters as
  the user last configured them; no notification/alert delivery yet
  (future phase).

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
  cap is enforced, never an invented number) and
  `paymentProcessingFeeBearer` (nullable enum, irrelevant until a live
  online payment provider exists).
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
  `docs/DECISIONS.md`). There is still no email channel. `type` is a
  fixed `NotificationType` enum (`NEW_ORDER`/`ORDER_STATUS_CHANGED`/
  `LISTING_REMOVED`/`LISTING_FLAGGED_FOR_REVIEW`/
  `LISTING_REVIEW_DECIDED`/`REPORT_RESOLVED`/`VERIFICATION_REVIEWED`).
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
