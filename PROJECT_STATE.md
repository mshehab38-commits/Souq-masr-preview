# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory.

Last updated: 2026-08-28 (Phase 5 completion)

## Current Status

**Phase 5 (Orders, Checkout, Payments, Shipping, Subscriptions) is
COMPLETE, validated, committed, and pushed.**

Branch: `claude/souq-masr-production-plan-g38qwv` (the branch with all
real engineering work — the GitHub `main` branch has only ever held the
original prototype upload and is not where this project lives).
Latest commit: see `git log -1` — two Phase 5 commits landed this round
(the implementation, then this test/docs completion pass).

**A note on how this branch got here**: this session began with the user
worried the project might be lost, because GitHub's default view showed
only `tamam-standalone.html`. That's simply `main` — every real commit
(Phases 1 through 5) has always lived on `claude/souq-masr-production-
plan-g38qwv` instead, and was already safely pushed. Nothing was ever
lost; this is noted here so a future session doesn't waste time
re-investigating the same non-issue.

## Phase History

| Phase | Description | Commit(s) | Status |
|---|---|---|---|
| 0 | Original prototype upload (`tamam-standalone.html`) | `280ef92` | Superseded, file retired in Phase 3 |
| 1 | Next.js/Prisma/Postgres/Redis foundation, catalog shell, geo/category seed | `51fddc1` | Done |
| 1B | Design system (teal/amber brand, UI primitives, RTL) | `c92e495` | Done |
| 2 | Phone-OTP auth, sessions, RBAC, verification requests, audit log | `9e3539e` | Done |
| 3 | Listings, images (storage + processing pipeline), search, favorites | `e2bcff8`, `d69b031` | Done |
| 4 | Seller dashboard, stores, bulk listing management, expiry sweep | `0185481` | Done |
| 5 | Orders, checkout, payments abstraction, shipping model, subscriptions, ledger | `6bb0f47` + this session's follow-up | **Done** |
| 6–11 | Trust & Safety, Admin (broader), Notifications, Observability/Launch (remaining roadmap) | — | Not started |

## Approved Business Model (governs all of Phase 5)

The owner approved this model explicitly before Phase 5 began — it is not
an engineering assumption:

1. **Zero commission on product sales.** Souq Masr never deducts anything
   from a seller's agreed price. `SellerPayout.amount` always equals
   `Order.productPrice` exactly.
2. **Platform revenue comes only from**: seller/business subscriptions,
   paid/promoted listings (data model exists; self-serve purchase flow
   not built yet — see Deferred below), and a commission charged **to
   shipping companies** (never to sellers or buyers) on shipments
   fulfilled through the platform.
3. **Shipping commission is admin-configurable per company**, never
   hardcoded, and defaults to 0% until the owner enters a real contracted
   rate.
4. **Free users get a configurable maximum active-listing count**,
   enforced by `resolveActiveListingLimit()`; unconfigured = unlimited
   (fails open, never an invented cap).
5. **Business/seller subscriptions are fully admin-configurable**
   (name, price, listing/image limits, promoted-listing/priority flags,
   geographic targeting, store features) — nothing hardcoded in
   application code.
6. **Financial architecture**: product-sale proceeds are never treated as
   platform revenue; every money movement is tagged in a `LedgerEntry`
   with an explicit `account` (`PLATFORM_REVENUE` / `SELLER_PAYABLE` /
   `BUYER_REFUNDABLE` / `SHIPPING_COMPANY_PAYABLE`) so the two can never
   be mixed in the data model itself, not just by convention.

## What Was Completed in Phase 5

- **Data model** (`prisma/schema.prisma`, 4 migrations this phase):
  `PlatformSettings` (singleton, nullable fail-open config),
  `SubscriptionPlan` + `Subscription`, `ShippingCompany` +
  `ShippingRate` (per-governorate) + `ShippingCommissionRule` +
  `ShippingSettlement`, `Order` (full state machine + money snapshots),
  `SellerPayout`, `LedgerEntry`. See `docs/DATABASE.md` for the complete
  entity writeup.
- **`settings` module**: `getPlatformSettings`/`updatePlatformSettings` —
  a lazily-created singleton row, every field nullable/fail-open.
- **`subscriptions` module**: plan CRUD, `grantSubscription` (admin-only
  for now — no live payment gateway exists for self-serve purchase),
  `resolveActiveListingLimit` (subscription plan limit overrides the
  platform free-tier default; both can be `null` = unlimited).
- **`shipping` module**: company CRUD, per-governorate rate management
  with a company-level `defaultFlatFee` fallback, commission rules
  (nullable %, 0 until set), and settlement computation that sums a
  company's completed orders in a period and posts exactly one
  `SHIPPING_COMMISSION_REVENUE` ledger entry for the commission only.
- **`ledger` module**: `recordLedgerEntry` (the single write path — callers
  pick `account` explicitly, never inferred), `listLedgerEntries`,
  `getLedgerSummary` (platform revenue by type, for the admin dashboard).
- **`payments` module**: `PaymentProvider` abstraction. `CodPaymentProvider`
  is the live default (cash-on-delivery — no gateway needed, matches the
  Egyptian market). `PaymobPaymentProvider` is built to their documented
  Accept API v1 flow but is only ever selected once real `PAYMOB_*`
  credentials exist (a production-credentials decision for the owner,
  never fabricated) — see `docs/DECISIONS.md` and the module's own
  comments (no dedicated `docs/PAYMENTS.md` was needed; everything is
  already documented there and in `docs/API.md`).
- **`orders` module**: the full state machine (Pending → Confirmed →
  Preparing → Ready for Pickup → Picked Up → In Transit → Out for
  Delivery → Delivered → Completed, plus Cancelled/Failed/Returned/
  Refunded/Disputed) with role-gated transitions (buyer/seller/admin/
  system). Checkout snapshots `productPrice`/`shippingFee`/
  `shippingCommissionAmount` at order time — never re-read live later.
  Placing an order reserves the listing (`SOLD`); cancelling releases it
  back to `ACTIVE` with a fresh expiry.
- **API routes**: `/api/orders` (+ `/buying`, `/selling`, `/[id]`,
  `/[id]/transition`), `/api/shipping-options`, `/api/webhooks/paymob`
  (inert until configured), and a full `/api/admin/*` surface (`settings`,
  `plans`, `subscriptions`, `shipping-companies` + rates/commission/
  settlements, `ledger`).
- **UI**: `/listings/[id]/checkout`, `/orders`, `/orders/[id]` (with
  role-appropriate action buttons), `/dashboard/orders`, and
  `/admin/{settings,plans,shipping,ledger}` — a real, usable admin
  console for every configurable value, not just an API surface.
- **Free-listing-limit enforcement** wired into `createListing` (fails
  open when unconfigured).

## Bug Found and Fixed This Session

**`OrderCancelledBy` enum was missing `ADMIN`.** `transitions.ts`'s
cancellation logic (`data.cancelledBy = actor === "SYSTEM" ? "SYSTEM" :
actor`) was correct, but the Prisma enum only had `BUYER`/`SELLER`/
`SYSTEM` — an admin-initiated cancellation crashed with a Prisma
validation error. Caught by a new automated test
(`tests/orders/transitions.test.ts`, "admin can cancel from any
actor-restricted state as an override") that the prior session hadn't
written yet. Fixed by adding `ADMIN` to the enum
(migration `20260828210000_add_admin_order_cancelled_by`) rather than
conflating admin overrides with automated system actions — they're
audit-distinct. No application code change was needed once the enum was
correct.

Also fixed during schema design (before this bug, same general class of
issue): the original `ShippingRate` design used a nullable `governorateId`
to represent a company-wide default rate, relying on
`@@unique([shippingCompanyId, governorateId])` to enforce "at most one
default per company." Postgres unique indexes treat every `NULL` as
distinct, so that constraint could never have actually enforced
uniqueness for the null case — caught by TypeScript rejecting a null
`governorateId` in the compound-key `where` input before it became a
runtime bug. Fixed by moving the fallback rate onto
`ShippingCompany.defaultFlatFee` directly and making
`ShippingRate.governorateId` required (migration
`fix_shipping_rate_default_fee_design`).

## Database

- 10 migrations applied, schema at `prisma/schema.prisma`. See
  `docs/DATABASE.md` for full entity documentation.

## Tests & Results (this session, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (174 modules, 552 dependencies).
- `npm test` — **191/191 unit tests passing** across 24 files. New this
  phase: `tests/settings/settings.test.ts`,
  `tests/subscriptions/subscriptions.test.ts`,
  `tests/shipping/shipping.test.ts`, `tests/ledger/ledger.test.ts`,
  `tests/orders/{state-machine,checkout,transitions}.test.ts` (88 new
  tests). Cleanup blocks in these new suites are deliberately scoped by
  relation (e.g. `{ order: { sellerId: { in: createdUserIds } } }`)
  rather than by broad `{ fieldId: { not: null } }` filters, since
  Vitest runs test files in parallel against the same real database —
  an unscoped cleanup in one file could otherwise delete rows another
  file's concurrently-running assertions depend on.
- `npx playwright test` — **4/4 e2e specs passing**: `auth-signup.spec.ts`,
  `listing-search-flow.spec.ts`, `store-management-flow.spec.ts`, and new
  `checkout-flow.spec.ts` (seller creates a commerce-enabled listing →
  buyer checks out via the real UI → order created with the full price,
  no shipping fee, `CASH_ON_DELIVERY` → listing reserved (`SOLD`) → zero
  ledger entries, proving the zero-commission guarantee at the UI layer,
  not just the module layer).
- `npm run build` — clean production build (43 routes, up from 34).
- Manually verified end-to-end (via curl and a real browser, across this
  session and the one before it): full COD order lifecycle produces zero
  ledger entries; a `PLATFORM_SHIPPING` order correctly snapshots the
  governorate-specific fee and commission; a computed shipping settlement
  produces exactly one `SHIPPING_COMMISSION_REVENUE` ledger entry for the
  commission only (not the full shipping fee); free-listing-limit
  enforcement and its subscription override both work; unpriced plans/
  unset commission rates correctly block rather than default to an
  invented number; the admin console pages
  (`/admin/{settings,plans,shipping,ledger}`) render and function
  correctly, including the "⚠️ not yet configured" fail-open messaging.

## Known Issues

### Open

- None. (The `OrderCancelledBy` and `ShippingRate` issues above were
  found and fixed within this same development pass, never shipped.)

### Deferred (not bugs — explicit scope decisions)

- **Self-serve online subscription purchase** isn't wired — it needs a
  live payment gateway, which needs real Paymob credentials (a
  production-credentials decision for the owner). Until then, an admin
  grants subscriptions directly (`POST /api/admin/subscriptions`), a
  legitimate pattern for early-stage B2B billing, not a placeholder hack.
- **Self-serve promoted-listing purchase** has no UI/checkout flow yet —
  same live-gateway dependency. The revenue-model groundwork
  (`SubscriptionPlan.allowPromotedListings`,
  `LedgerEntryType.PROMOTED_LISTING_REVENUE`) exists so this can be added
  without a schema change later.
- **Live courier API integration** (automatic `PICKED_UP`/`IN_TRANSIT`/
  `OUT_FOR_DELIVERY` status updates from a real shipping company's API)
  doesn't exist — those states are currently admin/seller-driven
  placeholders in the state machine, exactly where a future Shipping
  Provider abstraction would report status automatically.
- **Paymob integration is unverified against their live sandbox** — built
  to their documented Accept API v1 request/response shapes from
  training knowledge, but has never actually been exercised, since no
  real credentials exist. Verify the exact request/response shape and
  the webhook HMAC field order against Paymob's current sandbox before
  relying on it in production.

## Technical/Architecture Decisions (Phase 5)

See `docs/DECISIONS.md` for full rationale. Summary:

- Every LedgerEntry's `account` is chosen explicitly by the caller, never
  inferred by the ledger module — a caller bug (e.g. tagging product-sale
  proceeds as `PLATFORM_REVENUE`) is visible at the call site during
  review, not hidden behind "smart" logic.
- Cash-on-delivery is the payment default specifically because it
  requires zero gateway integration and matches how a large share of
  Egyptian e-commerce actually transacts today — not a stopgap, a real
  production-viable choice.
- Company-wide shipping-rate fallback lives on `ShippingCompany` itself,
  not as a nullable-governorate row in `ShippingRate`, because Postgres
  can't enforce "at most one" across NULL values in a unique index.
- Admin-driven configuration (settings/plans/shipping) got a real UI in
  this phase, not just an API, since the owner needs to actually run the
  business today — it wasn't deferred to the later, broader Admin phase.

## OWNER DECISION REQUIRED — Resolved

The 9 blocking decisions (D1–D9) tracked before Phase 5 began are now
**resolved** by the owner's approved zero-commission business model
(see "Approved Business Model" above), which supersedes the original
framing of those 9 items (most were premised on a commission existing at
all, which the owner ruled out entirely):

- **D1/D2 (commission/platform fee on sales)**: resolved — zero, by
  explicit owner decision. Not configurable-to-nonzero; the code has no
  commission concept on product sales at all.
- **D3/D4 (seller payout mechanics/timing)**: not yet relevant in
  practice — COD orders never have platform-held funds to pay out.
  `SellerPayout`/ledger code exists and is tested for the future ONLINE
  path, but nothing to configure until a live gateway exists.
- **D5 (payment processing fee bearer)**: modeled as
  `PlatformSettings.paymentProcessingFeeBearer`, nullable, no effect
  today (no gateway fee exists for COD). Still open for whenever Paymob
  goes live — not urgent.
- **D6 (shipping fee structure)**: resolved architecturally — per-company,
  per-governorate `ShippingRate` (+ company-level default), fully
  admin-configurable, exactly matching the owner's explicit requirement
  ("assigning orders to contracted shipping companies according to
  destination/governorate/coverage").
- **D7/D8 (cancellation/refund fee policy)**: not built — cancellation is
  currently free for both parties (Trust & Safety territory); revisit
  once real cancellation-abuse data exists.
- **D9 (taxes/VAT)**: still not engineering's call — no tax field exists
  in the schema; involve a tax advisor before this is ever needed.
- **D10 (subscription pricing)**: resolved architecturally — plans are
  fully admin-configurable with real prices set by the owner in
  `/admin/plans`, never hardcoded. No specific prices have been set yet;
  that's the owner's ongoing operational decision, not a blocker.
- **D11 (promoted listing pricing)**: data model exists
  (`allowPromotedListings`, `PROMOTED_LISTING_REVENUE`); no purchase flow
  yet (see Deferred above) — still not urgent.

**No new OWNER DECISION REQUIRED items are open right now.** Nothing in
Phase 5 required inventing a financial value; every configurable field
defaults to null/0/fail-open until the owner sets it via the admin
console.

## Blockers

None.

## Exact Next Action

Phase 5 is committed and pushed. Per the standing execution rule
(one phase at a time, validate, stop for approval), **this session stops
here** — awaiting the owner's direction on what to build next: options
include Trust & Safety/moderation, the broader Admin phase (user/listing
management beyond what Phase 5 already built for commercial config),
Notifications, or filling in one of the "Deferred" items above (e.g.
wiring real Paymob credentials once the owner has them). Read this file +
`docs/*` fresh at the start of that session and confirm current git state
matches this document before writing any code.
