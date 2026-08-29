# Business Model — Owner-Controlled Financial Rules

This document is the single source of truth for Souq Masr's approved
financial/commercial rules. It consolidates decisions the owner has
already made (previously recorded in `PROJECT_STATE.md` and
`docs/DECISIONS.md`); it introduces no new numbers.

**Rule for every future session**: read this file before touching
`src/modules/{ledger,orders,payments,shipping,subscriptions,settings}/`.
Never invent a value not listed here as approved — see "Financial
Boundary" below.

## 1. Zero Commission on Product Sales

Souq Masr never deducts anything from a seller's agreed sale price. This
is a hard architectural guarantee, not a configurable default:

- `SellerPayout.amount` always equals `Order.productPrice` exactly.
- There is no commission-on-sale field anywhere in the schema or code —
  it cannot be silently turned on by a future config change, only added
  back by a real owner decision and a real schema change.
- Every `LedgerEntry` is written with an explicit `account` chosen by the
  calling code (`PLATFORM_REVENUE` / `SELLER_PAYABLE` /
  `BUYER_REFUNDABLE` / `SHIPPING_COMPANY_PAYABLE`) — product-sale proceeds
  are structurally incapable of being tagged as platform revenue by
  accident.

## 2. Normal (Free) Users

- Free account, no subscription required to sell.
- A configurable maximum number of active listings, enforced by
  `resolveActiveListingLimit()` (`src/modules/subscriptions/`).
- **The exact numeric limit is an OWNER DECISION**, set via
  `PlatformSettings.freeListingLimit` in the `/admin/settings` console.
  Until the owner sets it, the platform **fails open** (unlimited
  listings) — it never defaults to an invented cap.

## 3. Businesses / Professional Sellers — Subscriptions

- May purchase paid subscription plans (`SubscriptionPlan` /
  `Subscription` models) for higher/unlimited listing limits, image
  limits, promoted-listing eligibility, geographic targeting, and store
  features.
- **Plan names, prices, and limits are entirely owner-configured** via
  `/admin/plans` — nothing is hardcoded in application code. No specific
  prices have been set yet; that is an ongoing owner operational decision,
  not an engineering blocker.
- Self-serve online purchase of a subscription is **not yet wired** — it
  requires a live payment gateway (real Paymob credentials, which don't
  exist yet). Until then, an admin grants subscriptions directly
  (`POST /api/admin/subscriptions`) — a legitimate interim B2B billing
  pattern, not a placeholder hack.

## 4. Platform Revenue Sources

Revenue comes **only** from:

1. Subscriptions (Section 3) — the main revenue source.
2. Promoted/paid listings — data model exists
   (`SubscriptionPlan.allowPromotedListings`,
   `LedgerEntryType.PROMOTED_LISTING_REVENUE`); no self-serve purchase
   flow yet (same live-gateway dependency as Section 3).
3. A small agreed commission charged **to contracted shipping companies**
   — never to sellers or buyers.

## 5. Shipping

- Shipping is modeled entirely separately from product-sale proceeds and
  from platform commission on sales (there is none — Section 1).
- `ShippingCompany` + `ShippingRate` support **per-governorate rates**
  with a company-level `defaultFlatFee` fallback, so orders can be
  assigned to a contracted shipping company according to destination/
  governorate/coverage, per the owner's explicit requirement.
- `ShippingCommissionRule` holds the platform's commission rate charged to
  each shipping company. **It is admin-configurable per company and
  defaults to 0%** until the owner enters a real contracted rate — never
  an invented percentage.
- Settlement (`ShippingSettlement`) sums a company's completed orders in a
  period and posts exactly **one** `SHIPPING_COMMISSION_REVENUE` ledger
  entry for the commission amount only — never the full shipping fee.

## 6. Financial Architecture

- Every money-moving write goes through the `ledger` module's single
  entry point (`recordLedgerEntry`), which requires the caller to state
  the `account` explicitly. There is no inference logic that could
  misclassify seller funds as platform revenue, or vice versa.
- Order money fields (`productPrice`, `shippingFee`,
  `shippingCommissionAmount`, `totalAmount`) are snapshotted at checkout
  time and never re-read live afterward, so a later change to a rate or
  plan price cannot retroactively alter an existing order's numbers.

## 7. Financial/Commercial Decisions Belong to the Owner

Claude may build the technical infrastructure for all of the above.
Claude must never independently set or assume:

- Subscription prices or percentages.
- Any commission or revenue-share percentage (sales, shipping, payment
  processing).
- Seller fees or charges of any kind.
- The free-tier listing limit, if not already set in
  `PlatformSettings`.
- Settlement percentages.
- Payment-gateway processing fees or who bears them.
- Revenue targets or broader financial policy.
- Cancellation/refund fee policy.
- Tax/VAT treatment.

If a task requires one of these and it isn't already an approved value
recorded in this document or in `PlatformSettings`/`SubscriptionPlan`/
`ShippingCommissionRule` in the database, mark it explicitly:

> **OWNER DECISION REQUIRED** — [the specific value needed and why]

...implement everything else so the feature works correctly once the
owner sets that value (nullable field, fails open, real admin UI to set
it), and do not block unrelated work on it.

## 8. Currently Open Owner Decisions

As of the last review (Phase 5 completion), **no blocking owner decisions
are open** — the zero-commission model resolved every item that had been
tracked pending it. Items that remain the owner's to set whenever ready
(none blocking current functionality, all fail open until set):

- The numeric free-listing limit (`PlatformSettings.freeListingLimit`).
- Subscription plan names/prices/limits (`/admin/plans`).
- Per-company shipping commission rates (`/admin/shipping`).
- Real Paymob production credentials (needed only to enable self-serve
  subscription/promoted-listing purchase and online payment generally).
- Cancellation/refund fee policy (not built — currently free for both
  parties; a Trust & Safety topic, not urgent).
- Tax/VAT treatment (no field exists in the schema; involve a tax advisor
  before this is ever needed).

See `PROJECT_STATE.md`'s "OWNER DECISION REQUIRED — Resolved" section for
the full historical walkthrough of how each originally-tracked decision
(D1–D11) was resolved by the approved model.
