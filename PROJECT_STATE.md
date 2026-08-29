# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory. Read `CLAUDE.md` first for the permanent operating
> rules this file's history assumes, `docs/BUSINESS_MODEL.md` before
> touching any financial logic, and `docs/OWNER_WORK_METHOD.md` for how
> the owner expects tasks to be framed.

Last updated: 2026-08-29 (Phase 7 completion)

## Current Status

**Phase 7 (Notifications: in-app notifications for order status
changes, new orders, resolved reports, and verification decisions) is
COMPLETE, validated, committed, and pushed.**

Branch: `claude/souq-masr-production-plan-g38qwv` (the branch with all
real engineering work — the GitHub `main` branch has only ever held the
original prototype upload and is not where this project lives).
Latest commit: see `git log -1`.

**A note on how this branch got here**: this session began with the user
worried the project might be lost, because GitHub's default view showed
only `tamam-standalone.html`. That's simply `main` — every real commit
(Phases 1 through 5) has always lived on `claude/souq-masr-production-
plan-g38qwv` instead, and was already safely pushed. Nothing was ever
lost; this is noted here so a future session doesn't waste time
re-investigating the same non-issue. Confirmed via GitHub: PR #1
(`claude/souq-masr-production-plan-g38qwv` → `main`) exists but is
**closed, not merged** — so `main` genuinely has never received any of
this work. All future development stays on
`claude/souq-masr-production-plan-g38qwv` unless explicitly told
otherwise.

**Permanent memory files** (read at the start of every session, per
`CLAUDE.md`): `/CLAUDE.md` (operating rules), `PROJECT_STATE.md` (this
file), `docs/BUSINESS_MODEL.md` (owner-approved financial rules —
consolidates, does not change, everything already recorded below and in
`docs/DECISIONS.md`), `docs/OWNER_WORK_METHOD.md` (how the owner expects
tasks to be framed across disciplines).

## Phase History

| Phase | Description | Commit(s) | Status |
|---|---|---|---|
| 0 | Original prototype upload (`tamam-standalone.html`) | `280ef92` | Superseded, file retired in Phase 3 |
| 1 | Next.js/Prisma/Postgres/Redis foundation, catalog shell, geo/category seed | `51fddc1` | Done |
| 1B | Design system (teal/amber brand, UI primitives, RTL) | `c92e495` | Done |
| 2 | Phone-OTP auth, sessions, RBAC, verification requests, audit log | `9e3539e` | Done |
| 3 | Listings, images (storage + processing pipeline), search, favorites | `e2bcff8`, `d69b031` | Done |
| 4 | Seller dashboard, stores, bulk listing management, expiry sweep | `0185481` | Done |
| 5 | Orders, checkout, payments abstraction, shipping model, subscriptions, ledger | `6bb0f47`, `b3a9c91` | Done |
| 6 | Trust & Safety + broader Admin: user directory/suspend/ban, listing reports & moderation queue, verification-request review | `4049a22`, `9b1315c` | Done |
| 7 | Notifications: in-app notification bell, order/report/verification trigger wiring | this session | **Done** |
| 8–9 | Observability/Launch, remaining roadmap items (see Deferred below) | — | Not started |

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

## What Was Completed in Phase 6

- **Data model** (1 migration, `20260829120000_add_reports`): new
  `Report` model (`ReportTargetType`/`ReportReason`/`ReportStatus`
  enums), with a hand-added `CHECK` constraint enforcing a report targets
  exactly one of a listing or a user. No other schema changes — Phase 6
  runs almost entirely on fields the schema had already scaffolded since
  Phase 2/3 (`User.role`'s `MODERATOR` value, `User.status`'s
  `SUSPENDED`/`BANNED`, `ListingStatus.PENDING_REVIEW`/`REJECTED`/
  `REMOVED`, `VerificationRequest.reviewedBy`/`reviewedAt`) but had never
  actually been wired up. See `docs/DATABASE.md`.
- **`identity` module additions**: `listUsers`/`getUserDetail` (admin
  directory), `setUserStatus` (suspend/ban/reactivate, with session
  revocation), `setUserRole` (with a last-admin-lockout guard),
  `listVerificationRequests`/`reviewVerificationRequest` (approve sets
  `commerceVerifiedAt` + promotes `role` to `BUSINESS` for a still-
  `INDIVIDUAL` user), and a new `requireModerator()` guard alongside the
  existing `requireAdmin()`.
- **`catalog` module addition**: `adminRemoveListing()` — same effect as
  the existing owner-scoped `softDeleteListing()` but not scoped by
  `ownerId`, since the caller is a moderator.
- **New `moderation` module**: `createReport` (with self-report and
  duplicate-open-report guards), `listReports`, `resolveReport`
  (composes into `catalog`/`identity`'s services to remove a listing or
  suspend a user as part of resolving a report).
- **API routes**: `POST /api/reports`; `/api/admin/users` (+`/[id]`);
  `/api/admin/reports` (+`/[id]`); `/api/admin/verification-requests`
  (+`/[id]`) — see `docs/API.md`.
- **UI**: `/admin/users` (+ `/[id]` detail/actions), `/admin/reports`
  (moderation queue), `/admin/verification` (review queue); a
  `ReportButton` component wired into `/listings/[id]` ("بلاغ عن
  الإعلان") and `/store/[slug]` ("بلاغ عن البائع"). The shared `/admin`
  layout now gates on `requireModerator()` instead of `requireAdmin()`,
  with the four Phase 5 financial pages (`settings`/`plans`/`shipping`/
  `ledger`) each re-checking `requireAdmin()` themselves — see
  `docs/DECISIONS.md` for why the split lives at two different layers.

## Notes From Phase 6

No application bugs were found this phase — the schema had already
scaffolded almost everything Phase 6 needed (see "What Was Completed"
above), so most of the work was wiring existing fields up rather than
new design. One test-only gotcha worth recording for future e2e specs:
Egyptian mobile numbers only validate for the `010`/`011`/`012`/`015`
prefixes (`src/modules/identity/phone.ts`) — an earlier draft of
`e2e/moderation-flow.spec.ts` used `014` for a third test user, which
`normalizeEgyptianPhone()` silently returns `null` for, and that `null`
then broke a later Prisma query in the wrong place, several steps away
from the actual mistake. Always use one of the four valid prefixes in
test fixtures.

## What Was Completed in Phase 7

- **Data model** (1 migration, `20260829130000_add_notifications`): new
  `Notification` model + `NotificationType` enum. In-app only — no
  email/SMS channel exists for general notifications (see
  `docs/DECISIONS.md`).
- **New `notifications` module**: `createNotification` (the single
  write path), `listNotifications`, `getUnreadCount`, `markAsRead`
  (ownership-scoped), `markAllAsRead`.
- **Trigger wiring** into existing flows — no new UI-facing flows, only
  side effects added to what already existed:
  - `orders/checkout.ts`: a new order notifies the listing's owner
    (`NEW_ORDER`).
  - `orders/transitions.ts`: a status change notifies whichever of
    buyer/seller didn't trigger it themselves — both, for an
    admin/system-driven transition (`ORDER_STATUS_CHANGED`).
  - `moderation/reports.ts`: resolving a report notifies the reporter
    (`REPORT_RESOLVED`); resolving with `REMOVE_LISTING` also notifies
    the listing's owner (`LISTING_REMOVED`).
  - `identity/verification.ts`: a verification decision notifies the
    requesting user (`VERIFICATION_REVIEWED`).
- **API routes**: `GET /api/notifications`, `PATCH
  /api/notifications/[id]`, `POST /api/notifications/read-all`.
- **UI**: a `NotificationBell` component in `SiteHeader` (unread-count
  badge, dropdown list, mark-read-on-click, mark-all-read, 30s poll) —
  visible to any logged-in user on every page.

## Bug Found and Fixed in Phase 7

**A client-bundle break from a well-intentioned de-duplication.**
`src/app/orders/order-status-labels.ts` (imported by the client
component `OrderActions.tsx`) originally hardcoded its own copy of the
Arabic order-status labels. While wiring the Phase 7 status-change
notification (which needed the same labels server-side), the first
attempt re-exported the app-layer file's labels from
`@/modules/orders/service` to avoid the duplication. That barrel
statically re-exports `checkout.ts`/`transitions.ts`, which import
`catalog/service.ts` → `catalog/listings.ts` → `jobs/queues.ts` →
`bullmq`, which needs Node's `child_process` — unreachable from a
browser bundle. Next.js's dev server immediately surfaced a "Module not
found: Can't resolve 'child_process'" build error on every page using
`OrderActions.tsx`, caught by the Playwright suite (3 of 5 e2e specs
failed with the `/login` page timing out, since `SiteHeader` — rendered
on every page — didn't itself trigger the error, but any order page
did, and the shared dev bundle broke for the whole app). Fixed by
reverting to two independent copies of the label map (documented in
`docs/DECISIONS.md`) rather than routing presentation text through a
module barrel unsafe for client-side import.

## Bug Found and Fixed in Phase 5

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

- 12 migrations applied, schema at `prisma/schema.prisma`. See
  `docs/DATABASE.md` for full entity documentation.

## Tests & Results (Phase 7, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (199 modules, 649 dependencies).
- `npm test` — **236/236 unit tests passing** across 29 files. New this
  phase: `tests/notifications/notifications.test.ts` (module),
  `tests/notifications/triggers.test.ts` (integration — asserts a
  `Notification` row actually appears after checkout, a transition, a
  report resolution, and a verification decision) (15 new tests).
- `npx playwright test` — **5/5 e2e specs passing** (all Phase 1-6
  specs, re-verified after the client-bundle fix below — this is what
  caught the bug in the first place).
- `npm run build` — clean production build (53 routes, up from 50).
- Adversarially re-validated after the client-bundle bug (see "Bug
  Found and Fixed in Phase 7" above): full `npm run build` +
  `npx playwright test` re-run from clean, both green.

## Known Issues

### Open

- None. (The `OrderCancelledBy`/`ShippingRate` issues from Phase 5 and
  the client-bundle issue from Phase 7 were all found and fixed within
  their own development pass, never shipped.)

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
- **Moderation is reactive (report-driven) only** — there is no
  proactive pre-publish review queue; listings still go straight to
  `ACTIVE` on creation. `ListingStatus.PENDING_REVIEW` exists in the
  schema for exactly this future use, unused until a pre-publish queue
  is actually built.
- **No rate limiting on `POST /api/reports` beyond same-target dedupe** —
  a user can still open reports against many different targets in quick
  succession. Proportionate for this phase's launch scope; add IP/user
  rate limiting (mirroring the existing OTP rate limiter pattern in
  `src/modules/identity/otp.ts`) if abuse is observed in practice.
- ~~No notification fires when a report is resolved or a verification
  request is decided~~ — **resolved in Phase 7**: both now fire an
  in-app `Notification`.
- **Notifications are in-app only** — no email/SMS delivery for
  anything except OTP. Needs a provider decision (which email service,
  or extending `SmsProvider`) before real external delivery can be
  built — the same category of gap as Paymob. See
  `docs/DECISIONS.md`.
- **No notification preferences/mute** — every trigger always fires for
  every user; there's no way for a user to opt out of a notification
  type. Not urgent at current volume; revisit if it becomes a
  complaint.

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

## Technical/Architecture Decisions (Phase 6)

See `docs/DECISIONS.md` for full rationale. Summary:

- `requireModerator()` (new) and `requireAdmin()` (existing) are split
  across different layers depending on the page/route — the shared
  `/admin` shell uses the looser gate, financial pages and
  status/role-changing routes re-check the stricter one themselves,
  and `PATCH /api/admin/reports/[id]` picks between them based on the
  request body's `action`, not just the route.
- Suspending/banning a user explicitly revokes their sessions even
  though `session.ts` already blocks a non-`ACTIVE` user's next request
  — deliberate defense-in-depth and an explicit audit trail, not
  redundancy.
- `Report`'s listing-vs-user exclusivity is enforced by a hand-added
  database `CHECK` constraint, not just application code — the same
  fix pattern as the `ShippingRate` nullable-uniqueness issue from
  Phase 5, applied proactively this time instead of after a bug.
- Resolving a report performs the side-effect action (remove listing /
  suspend user) *before* marking the report resolved, so a failed
  action leaves the report `OPEN` for retry instead of silently closing.
- Verification approval promotes `role` to `BUSINESS` only for a
  still-`INDIVIDUAL` user — it can never downgrade an `ADMIN`/
  `MODERATOR` account's role.

## Technical/Architecture Decisions (Phase 7)

See `docs/DECISIONS.md` for full rationale. Summary:

- Notifications are in-app only this phase — external delivery
  (email/SMS) needs a real provider decision, not a fabricated one, the
  same principle already applied to Paymob.
- `ORDER_STATUS_LABELS` is intentionally duplicated between
  `state-machine.ts` (server-side) and the app-layer
  `order-status-labels.ts` (client-side), not shared through
  `orders/service.ts` — that barrel statically pulls in BullMQ via
  `checkout.ts`/`transitions.ts` → `catalog`, which is unsafe to import
  from a client component. Caught by the Playwright suite; see "Bug
  Found and Fixed in Phase 7" above.
- Order-status-change notifications go to whichever of buyer/seller
  didn't trigger the transition themselves (both, for an admin/system
  actor) — the actor already knows about their own action.

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
Phases 5-7 required inventing a financial value; every configurable
field defaults to null/0/fail-open until the owner sets it via the
admin console.

## Blockers

None.

## Exact Next Action

Phase 7 is committed and pushed. The strongest remaining candidate,
based on what's genuinely missing today: **Phase 8 (Observability)** —
`@sentry/nextjs` is an installed-but-never-initialized dependency (no
`sentry.client.config.ts`/`sentry.server.config.ts`/
`instrumentation.ts` exist); real error tracking would need a Sentry
DSN (an owner/production-credentials decision, same category as
Paymob), but structured logging, a request-id/correlation convention,
and wiring the existing `src/lib/logger.ts` more consistently across
routes can all proceed without one. Other options: real email/SMS
notification delivery (needs a provider decision — see
`docs/DECISIONS.md`), or a Deferred item from Phase 5 (wiring real
Paymob credentials once the owner has them). Read this file + `docs/*`
fresh at the start of that session and confirm current git state
matches this document before writing any code.
