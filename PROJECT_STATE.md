# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory. Read `CLAUDE.md` first for the permanent operating
> rules this file's history assumes, `docs/BUSINESS_MODEL.md` before
> touching any financial logic, and `docs/OWNER_WORK_METHOD.md` for how
> the owner expects tasks to be framed.

Last updated: 2026-09-02 (Phase 28 completion)

## Current Status

**Phases 20 through 28 are all COMPLETE, validated, committed, and
pushed**: Phase 20 (twelve composite database indexes), Phase 21 (a
shared rate-limit utility wired into the three most abuse-prone write
endpoints, plus a root-cause verification-request pending-dedupe fix),
Phase 22 (three more fixes from a further audit round: a
timing-safe Paymob webhook HMAC comparison, a state guard closing a
worker-outage race in `processListingImage`, and isolating
`createNotification`'s own DB-write failure from every caller so a
transient blip can never report a false failure for an already-
succeeded business operation), Phase 23 (another fresh audit round —
session/cookie security and N+1 query patterns both confirmed clean;
`adminRemoveListing`/`flagListingForReview` now self-audit against the
Listing they mutate, closing a real gap where the report-driven
moderation path left no Listing-keyed trail in `AuditLog`), Phase 24
(a further audit round — CSRF coverage across all 40 mutating routes
and frontend authorization-assumption leaks both came back fully clean,
the second consecutive clean round this session), Phase 25 (closed
Phase 24's one cosmetic finding: `getUserDetail()` now uses an explicit
Prisma `select`, no longer over-fetching low-sensitivity fields into
the admin API response), and Phase 26 (completed the financial/
business-logic integrity audit that an earlier session interrupted
before it delivered results — five of seven checks came back clean;
the Paymob webhook now independently cross-checks the paid amount/
currency against the target order's own snapshotted total before ever
marking it `CAPTURED`, closing a real defense-in-depth gap where a
valid HMAC signature alone was trusted as proof the amount applied to
the right order), and Phase 27 (a product-gap prioritization pass —
with the technical/security audit backlog largely closed, this session
identified and built the highest-value owner-independent product gap:
a `/favorites` page. `toggleFavorite`/`listFavoriteListings` and a
paginated `GET /api/favorites` had existed since Phase 3/18, and every
listing detail page has had an "add to favorites" button the whole
time, but no page anywhere let a user view their favorited listings —
`docs/API.md` had explicitly flagged this as "no UI consumer" since
Phase 18. Also fixed a related bug found while building it: the
favorite button always rendered as "not favorited" on page load
regardless of the viewer's actual prior state), and Phase 28 (closed
the thin-metadata audit-log gap flagged but not fixed in Phases 23/24/26:
`updatePlatformSettings`, `updateShippingCompany`, `upsertShippingRate`,
`setCommissionRule`, `updatePlan`, and `revokeSubscription` now
self-audit with `{from, to}` metadata, moving `recordAudit` into the
module layer the same way Phase 23 did for `setUserStatus`/
`adminRemoveListing`/`flagListingForReview`).

Branch: `claude/souq-masr-production-plan-g38qwv` (the working
development branch, where every session's commits land first — see the
corrected note below for `main`'s actual, up-to-date state).
Latest commit: see `git log -1`.

**A note on how this branch got here, corrected**: an earlier version of
this note claimed PR #1 (`claude/souq-masr-production-plan-g38qwv` →
`main`) was "closed, not merged." That was wrong — checking the actual
repository (not just this file) during Phase 12 showed PR #1 **was**
merged into `main` via a real merge commit (`adb3964`), bringing Phases
1 through 5 (through `c57c992`) into `main` at that time. `main` simply
hadn't been updated since. As of this session (explicit owner
confirmation), `main` has been merged up to date with everything through
Phase 12 (`main` commit `56d5a03`, merging in feature-branch tip
`0f5242b` — a genuine merge, not a history rewrite; `git diff` between
them is empty). All development still happens on
`claude/souq-masr-production-plan-g38qwv` — that stays the working
branch for future sessions unless told otherwise — but `main` is now a
real mirror of it rather than stuck at the prototype, and should be kept
that way (merge, don't rewrite) if asked to sync it again.

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
| 7 | Notifications: in-app notification bell, order/report/verification trigger wiring | `163b5f4` | Done |
| 8 | Observability: request-id + lifecycle logging (all API routes), safe-logging audit/fix, job lifecycle logging, error boundaries, Sentry architecture | `28bd03f` | Done |
| 9 | Launch readiness: responsive mobile navigation, notification-dropdown overflow fix, report rate limiting | `286299a` | Done |
| 10 | Proactive moderation: flag-for-review escalation, pending-review admin queue, listing visibility gating fix | `e36dad3` | Done |
| 11 | SMS notification delivery: general-purpose `SmsProvider`, vendor-agnostic real gateway, SMS mirror on every notification | `d9ee7df` | Done |
| 12 | Saved-search alerts: CRUD + match-and-notify pipeline, migration-ordering bug fix | `0f5242b`, `492e876` | Done |
| 13 | Saved-search notification dedup, second migration-ordering bug fix | `ff69c0d` | Done |
| 14 | Email notification delivery: `EmailProvider` abstraction, optional `User.email` profile field, concurrent SMS+email dispatch | `d201c59` | Done |
| 15 | Concurrency-safety hardening: checkout double-sell race fixed, order-transition race fixed, CI missing Redis service fixed, `payments` module test coverage added | `5397d89` | Done |
| 16 | Cleanup jobs + hardening: `ListingImage` sweep, `OtpCode`/`Session` pruning, upload size limit, `createListing` limit race fixed | `9a8c757` | Done |
| 17 | Pagination for `listOrdersForBuyer`/`listOrdersForSeller`/`listListingsByOwner` | `4d47aad` | Done |
| 18 | Pagination for `listFavoriteListings`/`getVerificationRequests`, the two more unbounded "list my own data" queries a follow-up audit found | this session | Done |
| 19 | Pre-publish-review admin toggle: `requirePrePublishReview` on `PlatformSettings`, scaffolding only, default off | `03b16dc` | Done |
| 20 | Twelve composite DB indexes closing filter+sort query gaps (`User`/`VerificationRequest`/`Listing`/`Favorite`/`Order`/`LedgerEntry`/`Report`) | `a2911be` | Done |
| 21 | Rate limiting (`src/lib/rate-limit.ts`) on `POST /api/listings`, image upload-URL minting, bulk listing actions + verification-request pending-dedupe | `e7d0a12` | Done |
| 22 | Timing-safe Paymob webhook HMAC, `processListingImage` sweep-race guard, `createNotification` DB-write failure isolation | `c8543b4` | Done |
| 23 | Report-driven listing removal/flag now self-audits against the Listing (`admin.listing.remove`/`admin.listing.flag_for_review`); `setUserStatus` audit records `{from, to}` | `4505c51` | Done |
| 24 | Fresh audit round: CSRF coverage (all 40 mutating routes) and frontend authorization-assumption leaks — both fully clean, no code change | ef1f166 | Done (audit only) |
| 25 | `getUserDetail()` scoped to an explicit Prisma `select` — closes the Phase 24 data-minimization nit | 1a39277 | Done |
| 26 | Completed financial-integrity audit; fixed a real gap — Paymob webhook now cross-checks amount/currency against the order before capturing | 75653f8 | Done |
| 27 | Product-gap prioritization → built the missing `/favorites` page (backend existed since Phase 3/18, no UI consumer until now) + fixed the favorite-button's stale initial-state bug | `6b290a1` | Done |
| 28 | Closed the thin-metadata audit-log gap flagged (not fixed) in Phases 23/24/26: six settings/shipping/subscription admin functions now self-audit with `{from, to}` instead of only the submitted value | this session | **Done** |

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

## What Was Completed in Phase 8

- **`src/lib/api-handler.ts`** (new): `withApiHandler` — request-id
  generation/propagation (`x-request-id`), `api.request.start`/
  `api.request.complete`/`api.request.error` structured logging, a
  generic `500 { error, requestId }` on any uncaught exception (message
  and stack stay server-side + Sentry only, never in the client
  response), `Sentry.captureException` on error.
- **All 51 API route handlers wrapped** with `withApiHandler` (`/api/health`
  is the one deliberate exception — see docs/OBSERVABILITY.md), via a
  one-off, deleted-after-use Node codemod script using the TypeScript
  compiler API (not regex/brace-counting — several routes have template
  literals inside audit-log calls that would confuse a naive
  brace-counter).
- **`/api/health`** enhanced to check Redis (`PING`) alongside Postgres
  (`SELECT 1`), returning `{ status: "ok"|"degraded", checks }` with
  `200`/`503`.
- **Safe-logging fix**: `ConsoleSmsProvider` no longer logs the raw OTP
  code (was logging it unconditionally, in every environment, entirely
  redundantly — see "Bug Found" below).
- **Background job lifecycle logging**: `worker.on("completed", ...)`
  added alongside the existing `worker.on("failed", ...)` for all three
  BullMQ workers — symmetric success/failure visibility.
- **Frontend/server exception boundaries**: `src/app/error.tsx`,
  `src/app/global-error.tsx` (Arabic friendly message + retry, reports to
  Sentry client-side).
- **Sentry architecture** (no credentials invented): `src/instrumentation.ts`
  (+ `onRequestError` hook), `src/instrumentation-client.ts`,
  `src/sentry.server.config.ts`, `src/sentry.edge.config.ts` — every
  `Sentry.init()` explicitly guarded on `env.SENTRY_DSN`/
  `NEXT_PUBLIC_SENTRY_DSN` being set. Zero network activity today. New
  `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` optional env vars.
- **`next.config.ts`**: extended `serverExternalPackages` (the existing
  `bullmq` pattern) to also cover the OpenTelemetry/Prisma instrumentation
  packages Sentry's Node SDK pulls in, eliminating harmless-but-noisy
  webpack "Critical dependency" warnings introduced by adding Sentry.
- **`docs/OBSERVABILITY.md`** (new): the full reference — log level
  policy, request-id convention, `withApiHandler` usage requirement for
  new routes, safe-logging rules, job lifecycle convention, Sentry
  architecture, and the explicit OWNER DECISION REQUIRED callout for
  activation.

## Bug Found and Fixed in Phase 8

**`ConsoleSmsProvider` was logging live OTP codes.** Confirmed via audit:
`src/modules/identity/sms.ts`'s only `SmsProvider` implementation logged
`{ phone, code }` on every OTP request, unconditionally, in every
environment — meaning a production deployment that ran before a real SMS
provider is wired would leak every login code to whatever captures
stdout, to anyone with log access. Verified this was **entirely
redundant**: every test and e2e spec reads the code from the API
response's `devCode` field (gated `NODE_ENV !== "production"`), never
from logs. Fixed by removing `code` from the logged fields — zero
functional or test impact, confirmed by the full suite passing unchanged
before and after.

## What Was Completed in Phase 9

- **Responsive mobile navigation for `SiteHeader`**: the header had zero
  responsive behavior before this phase — every nav link, the "add
  listing" button, the notification bell, and the profile/login link were
  all unconditionally rendered in one row, which overflows/wraps badly
  below tablet width. Fixed with:
  - **`src/components/layout/nav-links.ts`** (new): the single canonical
    list of nav links/labels, shared by both the desktop nav and the new
    mobile nav so they can never drift apart.
  - **`src/components/layout/MobileNav.tsx`** (new): a hamburger-triggered
    panel (click-outside-to-close), rendered only below `md`, listing the
    same links as the desktop nav from `NAV_LINKS`.
  - **`src/components/layout/SiteHeader.tsx`** (rewritten): desktop nav/
    actions now `hidden ... md:flex`; a new `md:hidden` row renders the
    notification bell + `MobileNav` on narrow viewports.
- **`src/components/NotificationBell.tsx`**: the dropdown panel
  (`w-80`) could overflow off-screen on a narrow viewport; added
  `max-w-[calc(100vw-2rem)]`.
- **Rate limiting on `POST /api/reports`**: closed the Deferred gap noted
  since Phase 6 (only same-target dedupe existed; a reporter could still
  spam reports against many different targets). `src/modules/moderation/
  reports.ts` now enforces a per-reporter Redis sliding-window limit (20
  reports/hour), mirroring the existing OTP rate-limiter pattern. A
  deduped (`alreadyOpen: true`) report does not count against the limit.
  `src/app/api/reports/route.ts` maps the new `rate_limited` error to
  `429`.
- **Egypt-specific requirements re-verified** (RTL, Arabic labels,
  Egyptian phone validation, EGP formatting, all 27 governorates, mobile
  responsiveness) — no regressions found; the mobile-nav work is itself
  the direct fix for the one genuine mobile-responsiveness gap that
  existed.

## What Was Completed in Phase 10

- **Flag-for-review escalation**: `flagListingForReview()`
  (`src/modules/catalog/listings.ts`) moves an `ACTIVE` listing to
  `PENDING_REVIEW` — a reversible alternative to `adminRemoveListing` for
  an ambiguous report. Exposed as a new `resolveReport()` action
  (`FLAG_FOR_REVIEW`) alongside the existing `REMOVE_LISTING`/
  `SUSPEND_USER`, with a matching button ("تعليق للمراجعة") in
  `/admin/reports`.
- **Pending-review admin queue**: `listPendingReviewListings()` +
  `decidePendingListing()` back a new `/admin/listings/pending-review`
  page — a moderator approves (`ACTIVE`) or rejects (`REJECTED`) a
  flagged listing. New routes: `GET`/`PATCH
  /api/admin/listings/pending-review[/id]`.
- **Notifications**: two new `NotificationType` values
  (`LISTING_FLAGGED_FOR_REVIEW`, `LISTING_REVIEW_DECIDED`) so the seller
  learns their listing was pulled for review, then learns the outcome.
- **Real access-control gap fixed**: `getListingById` never filtered by
  status for a non-owner viewer — a `DRAFT` (or now `PENDING_REVIEW`/
  `REJECTED`) listing's ID was fetchable by anyone, including through
  `GET /api/listings/[id]`, which had no auth check at all. Fixed by
  gating on `status IN (ACTIVE, SOLD, EXPIRED)` for non-owners, with an
  exception for a `MODERATOR`/`ADMIN` viewer (who needs to see flagged
  content to moderate it). Found during this phase's own audit, not
  reported by anyone — see `docs/DECISIONS.md`.
- **`playwright.config.ts`**: global test timeout raised from the default
  30s to 60s — a pre-existing, unrelated spec
  (`store-management-flow.spec.ts`) was intermittently timing out on this
  sandbox's cold `next dev` compile cost across several routes in one
  test, not a real hang; see `docs/DECISIONS.md`.

## What Was Completed in Phase 11

- **`SmsProvider` extended from OTP-only to general-purpose**
  (`src/modules/identity/sms.ts`): the interface gained `sendMessage(phone,
  text)` alongside the existing `sendOtp(phone, code)`. `ConsoleSmsProvider`
  (dev/test fallback) implements both, logging only the phone — never the
  OTP code (unchanged from Phase 8) or the message text (new).
- **`HttpSmsProvider`** (new, real-gateway implementation): a
  vendor-agnostic POST of `{ to, message }` with a bearer token to a
  configurable URL, rather than one specific vendor's exact API — no real
  SMS gateway has been chosen, so no vendor's undocumented contract could
  be verified (same category of risk already flagged for Paymob). Selected
  by `getSmsProvider()` only when both `SMS_PROVIDER_API_URL` and
  `SMS_PROVIDER_API_KEY` are set; falls back to `ConsoleSmsProvider`
  otherwise. Both new env vars are optional in every environment,
  including production. See `docs/DECISIONS.md`.
- **`getSmsProvider` exported from `identity/service.ts`** so other
  modules can reach it — `notifications` now does.
- **`createNotification()`** (`src/modules/notifications/notifications.ts`)
  now sends a best-effort SMS mirror of every notification it creates
  (every `NotificationType`, no curated subset — see `docs/DECISIONS.md`
  for why), looking up the target user's phone directly. A lookup or send
  failure is logged and swallowed — it can never make the in-app
  notification (already saved) appear to fail.
- **A real, verified-safe circular module dependency**: wiring this
  created a cycle between `notifications/service.ts` and
  `identity/service.ts` (the latter already called into `notifications`
  since Phase 6). Confirmed safe both structurally (every export on both
  sides is a hoisted `function` declaration, not a `const`) and
  empirically (`tests/identity`, `tests/moderation`, `tests/orders` all
  pass). See `docs/DECISIONS.md`.

## What Was Completed in Phase 12

- **Saved-search CRUD**: the `SavedSearch` model has existed since Phase 3
  with zero implementation anywhere — no service, no API, no UI. Added
  `src/modules/search/saved-searches.ts`: `createSavedSearch` (capped at
  20/user), `listSavedSearches`, `deleteSavedSearch` (ownership-scoped).
  New routes: `GET`/`POST /api/saved-searches`, `DELETE
  /api/saved-searches/[id]`.
- **Match-and-notify pipeline**: `notifyMatchingSavedSearches(listingId)`
  checks a new listing against every saved search's stored filters
  (category/governorate/city by slug, price range, a normalized
  free-text substring check) and creates one `SAVED_SEARCH_MATCH`
  notification per matching user (never per matching saved search — see
  `docs/DECISIONS.md` for why, and for the deliberate tradeoff of a
  field-predicate match over re-running the live search engine per saved
  search). Wired into `src/jobs/search-indexing.ts`, right after
  `index()` populates the listing's `searchText`.
- **UI**: a "حفظ البحث" (save search) button on `/search` (only when
  logged in), and a new `/saved-searches` page listing/deleting them,
  linked from the shared nav (`NAV_LINKS.loggedIn`, so both desktop and
  mobile nav pick it up automatically).
- **New `NotificationType`**: `SAVED_SEARCH_MATCH` (migration
  `20260829084100_add_saved_search_match_notification_type`).

## Bug Found and Fixed in Phase 12

**A real, deploy-blocking migration-ordering bug.** Attempting this
phase's migration failed replaying the full migration history into a
fresh shadow database: `type "NotificationType" does not exist`. Root
cause: the Phase 10 migration (`20260829074331_add_listing_review_
notification_types`, an `ALTER TYPE ... ADD VALUE`) was folder-named
with a timestamp *earlier* than `20260829130000_add_notifications` (the
`CREATE TYPE` it depends on), even though it was genuinely applied
*after* it on the real dev database — `prisma migrate dev` against an
already-migrated database doesn't care what a new migration's folder
name implies about ordering, it just appends and runs it. `prisma
migrate deploy` (what CI and any fresh environment actually run) has no
such tolerance: it replays strictly by lexicographic folder name, so
this would have failed identically — and silently gone undetected —
on the first real CI run or fresh deployment, since this project's CI
only triggers on `push: main`/`pull_request`, neither of which has
happened since the bad migration was added in Phase 10. Fixed by
renaming the folder to `20260829140000_add_listing_review_notification_
types` (`git mv`) and updating the matching
`_prisma_migrations.migration_name` row on the dev database, then
re-running `migrate dev` to confirm a clean shadow-database replay. See
`docs/DATABASE.md` for the operational rule this establishes (verify a
new migration's folder name sorts after everything it depends on, not
just after its own creation time).

## What Was Completed in Phase 13

- **`SavedSearchNotification` dedup table**: a permanent, one-row-per-
  `(userId, listingId)` record with `@@unique([userId, listingId])` and
  **no relation to `SavedSearch`** — only to `User` and `Listing`,
  mirroring `Favorite`'s shape. Migration
  `20260829150000_add_saved_search_notifications`.
- **`notifyMatchingSavedSearches` now claims before it notifies**:
  `src/modules/search/saved-searches.ts` gained a private
  `claimSavedSearchNotification(userId, listingId)` helper (insert +
  catch `P2002`, the same pattern already used in
  `src/modules/store/store.ts` for slug collisions) called for every
  matching user before `createNotification`. A listing re-indexed after
  a title/description edit — the `search-indexing` job runs on every
  edit, not just creation — no longer re-notifies an already-notified
  user. Dedup survives `deleteSavedSearch`: the key is `(userId,
  listingId)` only, never tied to which specific saved search matched.
- No API or UI change — this is a pure internal-infrastructure fix.

## Bug Found and Fixed in Phase 13

**The Phase 12 migration-ordering bug recurred, undetected, in the very
next migration created after that fix.**
`20260829084100_add_saved_search_match_notification_type` (Phase 12's
own `ALTER TYPE ... ADD VALUE` migration, created immediately after the
Phase 10 ordering bug was fixed in that same session) had the identical
defect: folder-named with a timestamp earlier than
`20260829130000_add_notifications`, the migration that creates the type
it depends on. It went undetected at creation time because `prisma
migrate dev`'s shadow-database check, run while *creating* a new
migration, only replays migrations already on disk to compute the diff —
it doesn't re-verify the brand-new migration's own position once
written. Caught in Phase 13 while generating this phase's own migration
(the exact same `type "NotificationType" does not exist` shadow-database
failure as Phase 12's bug). Fixed the same way: renamed the folder to
`20260829141000_add_saved_search_match_notification_type` (`git mv`),
updated the matching `_prisma_migrations.migration_name` row, then
confirmed a clean full-history shadow-database replay with a bare,
no-argument `npx prisma migrate dev` (reports "already in sync" or fails
— nothing else) before proceeding. See `docs/DATABASE.md` and
`docs/DECISIONS.md` for the full writeup and the resulting standing
rule: that bare `migrate dev` check is now the mandatory last step of
any migration change, not just a nice-to-have.

## What Was Completed in Phase 14

- **`User.email`**: an optional, non-unique field (migration
  `20260830091324_add_user_email`) — a notification delivery address
  only, never a login credential; phone remains the sole identity key.
  No `emailVerifiedAt` yet — no collect-then-verify flow exists, so the
  column would be permanently `null` if added now (deferred, not
  fabricated).
- **`EmailProvider` abstraction** (`src/modules/identity/email.ts`) —
  mirrors `SmsProvider` exactly: `ConsoleEmailProvider` (default, logs
  only) and `HttpEmailProvider` (vendor-neutral POST of
  `{ to, subject, text }` with a bearer token), selected by a
  module-singleton `getEmailProvider()` gated on
  `EMAIL_PROVIDER_API_URL`/`EMAIL_PROVIDER_API_KEY` both being present —
  neither var is required in production (same treatment as SMS/Sentry).
  Also adds `normalizeEmail(raw): string | null`, a hand-rolled pure
  validator matching `normalizeEgyptianPhone`'s convention.
- **`createNotification` now dispatches SMS and email concurrently** via
  `Promise.allSettled`, each independently try/caught — an email failure
  can never block/suppress the SMS attempt or vice versa, and neither can
  make the in-app `Notification` row fail to save. The email send is
  skipped entirely (not attempted, not logged as a failure) when the
  target user has no `email` set.
- **Profile UI/API**: `/profile` gained an "البريد الإلكتروني (اختياري)"
  field alongside the existing name field, saved through the same
  `PATCH /api/profile` call (`name` required, `email` optional — omit to
  leave unchanged, `""` to clear, otherwise validated via
  `normalizeEmail` with `400 invalid_email` on failure). `GET /api/profile`
  now also returns `email`.

## What Was Completed in Phase 15

A fresh, no-assumptions OODA audit (the prior session's own instruction:
re-run this rather than trust its "nothing left" conclusion unchecked)
found real gaps outside the previously-tracked candidate list — this
phase closes the highest-severity ones:

- **`createOrder`'s listing reservation is now atomic**: the listing is
  reserved (`updateMany` guarded on `status: "ACTIVE"`) *before* the
  order is created, both inside one `$transaction`, with a new
  `listing_already_sold` result if the reservation loses the race. See
  "Bug Found and Fixed in Phase 15" below.
- **`transitionOrder`'s status write is now atomic**: guarded by
  `updateMany({ where: { id, status: order.status } })` instead of a
  plain `update`, closing the same class of race and making
  `recordCompletionFinancials` naturally idempotent as a side effect.
- **`.github/workflows/ci.yml` now starts a Redis service** — it never
  had one, only Postgres, despite `REDIS_URL` being set job-wide;
  every Redis-touching test/e2e step would have failed to connect the
  moment this workflow ever actually ran.
- **`payments` module test coverage added**: `tests/payments/providers.test.ts`
  (`CodPaymentProvider`, `getPaymentProvider` selection,
  `isOnlinePaymentConfigured`) and `tests/payments/paymob-webhook.test.ts`
  (`PaymobPaymentProvider.verifyWebhook` against a synthetic, correctly-
  HMAC'd payload — valid/invalid signatures, missing header, malformed
  JSON, both success/failure outcomes) — previously zero tests existed
  for this module at all.
- **Paymob webhook `merchant_order_id` extraction hardened**: found
  reading from a different scope (top-level payload) than every other
  field the same function reads (all nested under `obj`/`obj.order`/
  `obj.source_data`). Couldn't confirm which is actually correct against
  Paymob's real API (network egress to Paymob's docs is blocked in this
  environment) — fixed to check the nested location first with a
  top-level fallback, so it works either way, rather than assert one
  with unverified confidence. Still gated on the existing "verify
  against Paymob's live sandbox before going live" deferred item.
- Two very minor, lower-priority gaps found by the same audit were
  **not** fixed this phase (kept the phase scoped to what's completable
  in one clean pass) — moved to Known Issues/Deferred: a stuck-at-
  `PENDING` `ListingImage` after exhausted processing retries has no
  sweep/retry mechanism, and expired `OtpCode`/`Session` rows have no
  pruning job (unbounded table growth, not a correctness bug).

## Bug Found and Fixed in Phase 15

**A real, live double-sell race condition in checkout — not a
hypothetical.** `createOrder` (`src/modules/orders/checkout.ts`) read a
listing with `findFirst({ where: { status: "ACTIVE" } })`, created an
`Order` row, then wrote `listing.update({ data: { status: "SOLD" } })` —
a plain, unconditional update with no guard on the listing's status at
the moment of the write. Two concurrent checkouts on the same listing
(entirely plausible for a desirable listing — no rate limit or lock
prevented it) could both pass the initial read, both create their own
`Order`, and both flip the listing to `SOLD`: two buyers, each believing
they'd bought the same item, with nothing anywhere noticing. The
existing comment directly above the write already said "reserve the
listing immediately so it can't be sold to two buyers at once" — the
code just never actually enforced that atomically. Confirmed as real
(not just theoretical) with a regression test that fires two concurrent
`createOrder` calls at the same listing: against the pre-fix code both
calls succeeded and two `Order` rows were created; against the fixed
code exactly one succeeds.

Fixed by reordering the reservation to happen *before* order creation,
both inside one `prisma.$transaction`, with the reservation done as
`listing.updateMany({ where: { id, status: "ACTIVE" }, data: { status:
"SOLD" } })` — the `WHERE status: "ACTIVE"` clause is what actually
makes this atomic (Postgres serializes concurrent UPDATEs on the same
row; the loser's WHERE simply stops matching once the winner commits).
A new `listing_already_sold` checkout error surfaces this to the buyer
("تم بيع هذا الإعلان لمشترٍ آخر للتو"). `transitionOrder` had the
identical unguarded-write shape and was fixed the same way (`updateMany`
guarded on the order's previously-read `status`), which as a side effect
also makes `recordCompletionFinancials` idempotent against a duplicate
concurrent "mark COMPLETED" call. See `docs/DECISIONS.md` for the full
writeup of both fixes and why a transaction (not just a guarded update)
was needed for the checkout case specifically.

## What Was Completed in Phase 16

A fresh audit (per Phase 15's own instruction to re-audit rather than
trust a "nothing left" conclusion unchecked) covered two things: a deep
dive into the two items Phase 15 already flagged as top candidates, and
a from-scratch pass over angles not yet checked (upload limits,
pagination, other read-then-write races, money precision, session/cookie
security). Four genuine, purely-technical, owner-decision-free gaps came
out of it, all fixed this phase:

- **`ListingImage` stuck-at-`PENDING` sweep**: `processListingImage`
  (`src/jobs/image-processing.ts`) has no `catch` block — any thrown
  error exhausts BullMQ's 3 retries and marks the *job* failed without
  ever touching `ListingImage.status`, leaving it `PENDING` forever
  (indistinguishable from "still processing"). New hourly repeatable job
  (`src/jobs/listing-image-sweep.ts`, wired into `queues.ts`/`workers.ts`/
  `worker.ts`, mirroring `listing-expiry.ts`'s exact pattern) flips
  anything still `PENDING` past 1 hour old to `REJECTED`.
- **`OtpCode`/`Session` pruning**: neither table was ever filtered by
  expiry at the query level — both grow unbounded (confirmed live during
  this phase's own test run: 274 stale `OtpCode` rows had accumulated in
  the dev database from this session's own prior test runs alone). New
  hourly repeatable job (`src/jobs/auth-row-pruning.ts`) `deleteMany`s
  rows past `expiresAt`.
- **Listing-image upload size limit**: `requestImageUploadTarget` only
  validated `contentType`, never size; `processListingImage` loaded the
  entire original into memory and ran `sharp()` on it 3× at worker
  concurrency 4 — a real memory-exhaustion vector, inconsistent with
  `branding.ts`'s equivalent `MAX_UPLOAD_BYTES` check (existing since
  Phase 4). Fixed by adding `getObjectSize(key)` to the `StorageProvider`
  interface (`HeadObjectCommand` for R2, `stat().size` for local) and
  checking it **before** ever calling `getObject()` — rejecting (as
  `REJECTED`) anything over 15 MB without loading it into memory.
- **`createListing`'s active-listing-limit race fixed**: a plain
  count-then-create with no transaction between them let two concurrent
  requests from the same seller both read a count below their plan's
  limit before either committed — the same bug class Phase 15 fixed
  twice elsewhere (checkout, order transitions), left unfixed here.
  Fixed differently than those two: this is a count-then-create race
  against an aggregate, not a single row's state transition, so the
  `updateMany`-guard pattern doesn't apply. Wrapped the count check and
  `create` in one `prisma.$transaction` under `Serializable` isolation
  (Postgres detects the conflict itself, surfaced by Prisma as `P2034`),
  with a single retry on that error.
- Two more findings from the same audit were investigated and
  deliberately **not** fixed this phase — moved to Known Issues/Deferred:
  three unbounded (unpaginated) list queries (`listOrdersForBuyer`/
  `listOrdersForSeller`/`listListingsByOwner`), and a pre-existing,
  systemic `toFixed(2)` money-rounding pattern in
  `src/modules/shipping/commission.ts`.

## What Was Completed in Phase 17

Closes the pagination gap Phase 16's audit found but deliberately left
unfixed to keep that phase scoped:

- **`listOrdersForBuyer`, `listOrdersForSeller`, `listListingsByOwner`**
  (`src/modules/orders/orders.ts`, `src/modules/catalog/listings.ts`)
  now follow the exact `{ items, page, totalPages, totalCount }` shape
  and `DEFAULT_LIMIT`/`MAX_LIMIT` (20/100) clamp already used everywhere
  else in this codebase (`listNotifications`, search, saved searches,
  moderation's report queue, the pending-review queue) — the only three
  holdouts, not a new pattern.
- **New `UrlPagination` component** (`src/components/ui/UrlPagination.tsx`)
  — a path-agnostic version of the existing `SearchPaginationClient`
  pattern (which hardcodes `/search`), reused across the three newly-
  paginated pages (`/orders`, `/dashboard/orders`, `/listings/mine`)
  instead of writing three near-identical one-off wrappers.
  `SearchPaginationClient`/`/search` were left untouched.
- **Three API routes updated to match**: `GET /api/orders/buying`,
  `GET /api/orders/selling`, `GET /api/listings/mine` now accept
  `?page=`/`?limit=` and return the paginated shape. Confirmed via grep
  this breaks no existing caller — none of the three are consumed by any
  client-side code in this app today (the corresponding pages call the
  module functions directly as Server Components); they exist purely as
  part of the documented API surface for a future mobile client.
- No schema change, no new routes, no product/business decision
  involved — a pure technical consistency fix.

## What Was Completed in Phase 18

A fresh audit (explicitly re-checking rather than trusting Phase 17's
own "these three were the only holdouts" conclusion — the standing
lesson from Phases 15-17) found two more genuinely unbounded "list my
own data" queries:

- **`listFavoriteListings`** (`src/modules/catalog/favorites.ts`) and
  **`getVerificationRequests`** (`src/modules/identity/verification.ts`)
  now follow the same `{ items, page, totalPages, totalCount }` shape
  and `DEFAULT_LIMIT`/`MAX_LIMIT` (20/100) clamp as every other list
  query in this codebase. `getVerificationRequests`'s sibling in the
  same file, `listVerificationRequests` (the admin queue), was already
  in this shape — a ready-made template.
- **`GET /api/favorites`** and **`GET /api/verification-requests`** now
  accept `?page=`/`?limit=` and return the paginated shape. Confirmed
  via grep this breaks no caller: `GET /api/favorites` has zero UI
  consumers (favorites are only toggled via a heart button on a
  listing's detail page — same "documented API surface for a future
  mobile client" situation as Phase 17's three routes);
  `GET /api/verification-requests` and `src/app/profile/page.tsx`'s
  direct call were both updated to destructure `{ items }`.
- **No pagination UI added for verification requests** — deliberately:
  a user's own request count is structurally bounded to a handful over
  an account's lifetime, so a `UrlPagination` control would be
  over-engineering. `/profile` continues to render the full (small)
  first page.
- Two further findings from the same audit are recorded as deliberately
  **deferred**, not fixed, since they're a different risk profile (small
  admin-managed reference tables / a separate admin-only concern, not
  user-generated "list my own data"): `GET /api/admin/shipping-companies`
  and `GET /api/admin/plans` are unbounded; `GET /api/admin/ledger` is
  capped at 50 rows with no further page. See Known Issues → Deferred.
- No schema change, no new routes, no product/business decision
  involved — a pure technical consistency fix, same class as Phase 17.

## What Was Completed in Phase 19

Scaffolding for mandatory pre-publish moderation, per the owner's
explicit answer when asked directly: build the technical capability,
do not flip the live default.

- **`PlatformSettings.requirePrePublishReview Boolean @default(false)`**
  (migration `20260831183256_add_require_pre_publish_review`) — the
  first plain boolean toggle in this model, deliberately non-nullable
  (unlike every other field in it) since a switch has no meaningful
  third "unconfigured" state. Default `false` = today's existing
  behavior, unchanged.
- **`createListing`** (`src/modules/catalog/listings.ts`) reads the
  setting once via `getPlatformSettings()` and creates the listing at
  `PENDING_REVIEW` instead of `ACTIVE` when it's `true`. `expiresAt` is
  set immediately either way — the deliberate choice that let this ship
  with **zero changes** to the Phase 10 pending-review queue
  (`listPendingReviewListings`/`decidePendingListing`); a toggle-on
  listing flows through the exact same admin queue as a report-driven
  flag.
- **Admin settings API + UI**: `PATCH /api/admin/settings` accepts
  `requirePrePublishReview: boolean`; `/admin/settings` has a new
  checkbox with an explanatory hint showing the current state.
- **Two Arabic copy fixes**, narrowly caused by this feature: the
  pending-review queue's approve button ("الموافقة وإعادة النشر" →
  "الموافقة والنشر" — dropping "re-" since a toggle-on listing was
  never live before) and the approval notification (dropped "مجددًا" /
  "again" for the same reason). The e2e spec asserting the old button
  text (`e2e/pending-review-flow.spec.ts`) was updated to match.
- **No live behavior change**: the toggle defaults to `false`, and
  nothing in this phase flips it. New listings continue to publish
  straight to `ACTIVE` exactly as before, unless and until an admin
  explicitly opts in via `/admin/settings`. The decision to actually
  turn it on for the live marketplace remains open and is the owner's
  alone — this phase only makes the capability available.

## What Was Completed in Phase 20

A fresh audit — deliberately testing whether the prior session's
"nothing purely-technical left" conclusion would hold, per this file's
own standing precedent that it never has — found genuine missing
composite database indexes on several high-growth tables, alongside a
clean result on a separate IDOR/authorization audit (no gap found across
all 55 API routes — not revisited).

- **Twelve composite indexes added** (migration
  `20260831192836_add_composite_indexes_for_pagination_queries`) across
  `User`, `VerificationRequest`, `Listing` (two composites for its two
  real query shapes — default browse and price-sorted browse),
  `Favorite`, `Order`, and `LedgerEntry`/`Report`. Each targets a real,
  named call site (`listUsers`, `getVerificationRequests`/
  `listVerificationRequests`, `listListingsByOwner`,
  `PostgresSearchProvider`'s search, `listFavoriteListings`,
  `listOrdersForBuyer`/`listOrdersForSeller`, `listLedgerEntries`,
  `listReports`) — not a speculative index on every possible filter
  combination. Full details in `docs/DATABASE.md`.
- Deliberately **not** indexed this phase (real but lower-value —
  Tier 3): the `Listing` pending-review queue, `Subscription`,
  `ShippingSettlement`. See Known Issues → Deferred.
- Old single-column indexes that these composites partially supersede
  were deliberately left in place, not dropped — see `docs/DECISIONS.md`.
- No schema removal, no application code change, no product/business
  decision involved — a pure technical hardening pass.

## What Was Completed in Phase 21

The same audit round that found the Phase 20 index gaps also ran a
rate-limiting coverage audit (and a separate IDOR/authorization audit
across all 55 API routes, which came back clean — no gap found).

- **New shared `checkRateLimit(key, max, windowSeconds)`**
  (`src/lib/rate-limit.ts`) — a generic Redis fixed-window limiter
  generalizing the pattern already hand-rolled independently in
  `requestOtp`/`createReport`. Those two existing limiters are
  deliberately left untouched (both have compound logic beyond a single
  window check) — new call sites use the shared utility instead.
- **Wired into three genuinely abuse-prone endpoints**, each previously
  unrated: `POST /api/listings` (`createListing`, 20/hour/user — the
  only prior guard fails open when no plan limit is configured), `POST
  /api/listings/[id]/images/upload-url` (`requestImageUploadTarget`,
  60/hour/user — mints presigned storage URLs with only a content-type
  check before this), and `POST /api/listings/bulk` (30/hour/user,
  checked at the route boundary via a new `checkBulkActionRateLimit` so
  `bulkUpdateListings`'s existing `{ requested, affected }` return
  shape and its 4 passing tests needed no breaking change).
- **`submitVerificationRequest` root-cause dedupe**: was a bare
  `prisma.verificationRequest.create` with no dedupe at all — a user
  with an already-`PENDING` request could flood the human-reviewed
  admin queue. Fixed by returning the existing `PENDING` request
  instead of creating a duplicate, modeled directly on `createReport`'s
  same-target `OPEN`-report dedupe. This changed `POST
  /api/verification-requests`'s response shape to `{ request,
  alreadyPending }`, requiring a matching update to
  `src/app/profile/ProfileView.tsx`'s submit handler.
- **`POST /api/stores` investigated and confirmed already sufficiently
  protected**: `Store.ownerId @unique` enforces one-per-owner at the
  database level. No rate limit added.
- Deliberately deferred (real but lower-severity, not fixed this
  phase): `POST /api/listings/[id]/favorite`, `POST
  /api/saved-searches`, `POST /api/listings/[id]/images/confirm`, `POST
  /api/listings/[id]/renew`, `POST /api/orders` (already naturally
  capped — `createOrder` atomically reserves the listing to `SOLD`, so
  at most one successful order can exist per listing). See Known
  Issues → Deferred.
- No product/business decision involved — all three threshold values
  are technical anti-abuse defaults, not commercial policy.

## What Was Completed in Phase 22

Per the owner's explicit continuation directive, three more fresh
audits ran on ground not yet checked this session: background-job
idempotency/retry safety, Paymob webhook duplicate-processing
protection, and notification-delivery reliability. Two came back
clean — background-job idempotency (every job is either a trivially
idempotent guarded write, or, for saved-search-match notifications,
protected by a real DB unique constraint + `P2002` catch) and Paymob
webhook duplicate-processing (a single atomically-guarded `updateMany`
is the webhook's entire side effect, so a duplicate delivery is a
guaranteed no-op with no separate idempotency table needed) — both
confirmed by reading the actual code, not assumed from documentation.

Three real, fixable gaps were found and fixed:

- **Paymob webhook HMAC comparison made timing-safe**
  (`src/modules/payments/paymob-provider.ts`) — was a plain `!==`
  string comparison; now uses `crypto.timingSafeEqual` with an explicit
  length check first (which itself would throw on a length mismatch).
- **`processListingImage`'s three status-setting writes now guard on
  `status: "PENDING"`** (`src/jobs/image-processing.ts`, via
  `updateMany` instead of `update`) — closes a real, if narrow, race
  where a worker-outage backlog could let a job resurrect a row the
  `listing-image-sweep` had already correctly rejected.
- **`createNotification`'s own database write is now isolated from
  every caller** (`src/modules/notifications/notifications.ts`) — a
  transient failure writing the `Notification` row itself (not just the
  SMS/email mirrors, which were already protected) previously
  propagated uncaught through `createOrder`, `notifyCounterparty`,
  `resolveReport`, and `reviewVerificationRequest` — all of which call
  it after their real business operation has already committed — into
  `withApiHandler`'s generic 500. That reported a **false failure** to
  the client for an operation that had actually already succeeded,
  while silently losing that one notification. Now returns `null`
  instead of throwing; no caller inspects the return value, so this is
  non-breaking.
- A related, lower-severity, narrower consequence for the saved-search
  claim-then-notify pattern specifically was investigated and accepted
  as a documented trade-off rather than separately fixed — see
  `docs/DECISIONS.md`.
- No product/business decision involved — three purely technical
  correctness fixes.

## What Was Completed in Phase 23

Per the standing "keep re-auditing with fresh eyes" precedent, three
more fresh audits ran on ground not yet checked this session: session/
cookie security flags, N+1 query patterns across every list-returning
service function and Server Component page, and admin/moderator
audit-log completeness. Two came back clean, confirmed by reading the
actual code:

- **Session/cookie security**: `httpOnly`/`secure`(env-conditional)/
  `sameSite: lax`/`path: /` are all correctly set on the session cookie;
  the CSRF cookie's `httpOnly: false` is the *correct*, required choice
  for its double-submit pattern, not an inconsistency; session expiry is
  re-validated server-side on every request, not just at issuance; and
  logout both revokes server-side and clears both cookies client-side.
- **N+1 queries**: every list-returning service function batches its
  relations via Prisma `include`/`select` in one query (or parallel
  `groupBy`/`aggregate`/`count` for `getSellerStats`, the one place that
  could have hidden a per-listing loop); no Server Component page calls
  a per-row async fetch inside a `.map()`.

One real, genuine gap was found and fixed:

- **`adminRemoveListing()` and `flagListingForReview()`
  (`src/modules/catalog/listings.ts`) now self-audit against the
  `Listing` they mutate** — new `admin.listing.remove`/
  `admin.listing.flag_for_review` audit actions, both functions now take
  a required `actorId`. Previously, the only path to either function
  (`resolveReport` in `src/modules/moderation/reports.ts`) produced a
  `Report`-keyed audit entry that didn't even record the listing's id —
  so "what happened to listing X" was unanswerable from `AuditLog`
  alone for the entire report-driven moderation path, unlike the
  parallel `SUSPEND_USER` action which was already properly
  self-audited by `setUserStatus`. Also added `listingId`/`targetUserId`
  to `admin.report.resolve`'s own metadata for the same reason.
- **`setUserStatus`'s audit entries now record `{from, to}`**, not just
  the new status — closes a small inconsistency with `setUserRole`
  (same file), which already captured this.
- No product/business decision involved — a pure audit-trail
  completeness fix, no financial value, no behavior change visible to
  any user or admin beyond richer `AuditLog` rows.

~~Several thin-metadata audit gaps (settings/shipping/subscription-plan
updates recording only new values, never prior state) were found and
deliberately deferred~~ — **resolved in Phase 28**: `updatePlatformSettings`,
`updateShippingCompany`, `upsertShippingRate`, `setCommissionRule`,
`updatePlan`, and `revokeSubscription` all now self-audit with
`{from, to}` (or, for `revokeSubscription`, `{userId, planId}` where
previously there was no metadata at all).

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

- 18 migrations applied — unchanged this phase (Phase 22 is a pure
  application-code change, no schema change). Last migration:
  `20260831192836_add_composite_indexes_for_pagination_queries` (Phase
  20 — 12 composite indexes across `User`/`VerificationRequest`/
  `Listing`/`Favorite`/`Order`/`LedgerEntry`/`Report`). Schema at
  `prisma/schema.prisma`. See `docs/DATABASE.md` for full entity
  documentation.

## What Was Completed in Phase 28

Closed the thin-metadata audit-log gap flagged (but not fixed) in
Phases 23, 24, and 26's own entries: six admin `update`/`upsert`/
`revoke` functions previously recorded either only the submitted value
or (for `revokeSubscription`) nothing at all. Mirrors the exact
"self-audit inside the module function" pattern Phase 23 already
established for `setUserStatus`/`adminRemoveListing`/
`flagListingForReview`:

- `settings.ts`'s `updatePlatformSettings` — now self-audits `{from, to}`
  scoped to only the changed keys.
- `shipping/companies.ts`'s `updateShippingCompany` — same, plus fixed a
  latent Decimal-serialization bug (`defaultFlatFee` is a Prisma
  `Decimal`; converted via `instanceof Prisma.Decimal` + `.toNumber()`
  before it reaches JSON metadata).
- `shipping/rates.ts`'s `upsertShippingRate` — `from` is the prior fee
  for that governorate, or `null` on a first-time insert.
- `shipping/commission.ts`'s `setCommissionRule` — same null-on-first-set
  shape.
- `subscriptions/plans.ts`'s `updatePlan` — same `{from, to}` pattern;
  same Decimal fix applied (`monthlyPrice`/`yearlyPrice`).
- `subscriptions/subscriptions.ts`'s `revokeSubscription` — previously
  recorded zero metadata; now reads the subscription first and records
  `{ userId, planId }`.

All six route handlers had their own now-redundant `recordAudit` calls
removed and now pass `admin.id` through as a new `actorId` parameter.
`create`/`delete`-shaped actions were deliberately left untouched (no
"from" state for a create; a delete's `targetId`-only metadata is
already sufficient). See `docs/DECISIONS.md`'s Phase 28 entry for full
rationale. No financial/business decision involved — pure audit-trail
completeness, no behavior change visible to any admin beyond richer
`AuditLog` rows.

## Tests & Results (Phase 28, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (227 modules, 816 dependencies).
- `npm test` — **374/374 unit tests passing** across 46 files. New this
  phase: 1 test in `tests/settings/settings.test.ts` (two sequential
  updates, second's `from` matches first's `to`), 3 new tests in
  `tests/shipping/shipping.test.ts` (`updateShippingCompany`,
  `upsertShippingRate` first-insert-vs-overwrite, `setCommissionRule`
  first-set-vs-overwrite), 2 new tests in
  `tests/subscriptions/subscriptions.test.ts` (`updatePlan`'s `{from,
  to}`, `revokeSubscription`'s new `{userId, planId}` metadata plus a
  no-double-audit-on-already-cancelled case). Existing call sites in
  `tests/orders/checkout.test.ts` updated for the new `actorId`
  parameters.
- `npx playwright test` — **9/9 e2e specs passing**, unmodified — no
  route/UI behavior changed, only audit metadata shape.
- `npm run build` — clean, warning-free production build.

## Tests & Results (Phase 27, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (227 modules, 813 dependencies —
  two new page files, no new module-boundary violations).
- `npm test` — **367/367 unit tests passing** across 46 files. New this
  phase: 3 tests for `isListingFavorited()`
  (`tests/catalog/favorites.test.ts`) covering the true/false/
  scoped-per-user cases.
- `npx playwright test` — **9/9 e2e specs passing** (new
  `e2e/favorites-flow.spec.ts`: favorite a listing from its detail
  page, confirm the button's state survives a reload — the initial-
  state bug's regression proof — see it on `/favorites`, remove it from
  there, and confirm the detail page's button reflects the removal too).
- `npm run build` — clean, warning-free production build; one new
  route (`/favorites`).

## Tests & Results (Phase 26, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (225 modules, 799 dependencies —
  one new file, `src/modules/payments/webhook-amount.ts`).
- `npm test` — **364/364 unit tests passing** across 46 files. New this
  phase: 6 tests for `webhookAmountMatchesOrder`
  (`tests/payments/paymob-webhook.test.ts`) covering exact match,
  amount too low, amount too high, currency mismatch, missing
  amount/currency, and fractional-piastre rounding; the 2 existing
  `verifyWebhook` exact-equality tests updated to include the new
  `amountCents`/`currency` fields. (One unrelated test —
  `createReport`'s rate-limit loop — timed out on a cold-started
  Postgres/Redis mid-suite-restart; re-ran clean in isolation and in
  the full suite afterward, confirming it was restart-timing, not a
  regression.)
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified.
- `npm run build` — clean, warning-free production build; no new
  routes (webhook route's behavior changed, its path/shape didn't).

## Tests & Results (Phase 25, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (224 modules, 798 dependencies —
  unchanged; a `select` clause added to an existing query, no new
  module files).
- `npm test` — **358/358 unit tests passing** across 46 files. New this
  phase: a regression test in `tests/identity/admin.test.ts` asserting
  `getUserDetail()`'s returned `user` object matches exactly the 7
  expected fields and explicitly lacks `email`/`phoneVerifiedAt`/
  `deletedAt`/`updatedAt`.
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified.
- `npm run build` — clean, warning-free production build; no new
  routes, no response-shape change for the one real consumer
  (`UserDetail.tsx`).

## Tests & Results (Phase 23, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (224 modules, 798 dependencies —
  unchanged module count; pure code fixes to existing files, no new
  module files).
- `npm test` — **357/357 unit tests passing** across 46 files. New this
  phase: a Listing-keyed audit-entry assertion in
  `tests/catalog/admin-remove.test.ts` and `tests/catalog/pending-review.test.ts`,
  two matching assertions added to the existing `resolveReport`
  `REMOVE_LISTING`/`FLAG_FOR_REVIEW` tests in
  `tests/moderation/moderation.test.ts`, and a `{from, to}` metadata
  assertion in `tests/identity/admin.test.ts`.
- `npx playwright test` — see below (this phase touches no UI/route
  surface, only internal audit-log writes, so no e2e spec needed
  changes).
- `npm run build` — clean, warning-free production build; no new
  routes.

## Tests & Results (Phase 22, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (224 modules, 797 dependencies —
  unchanged; pure code fixes to existing files, no new module files).
- `npm test` — **354/354 unit tests passing** across 46 files. New this
  phase: a wrong-length-HMAC case in `tests/payments/paymob-webhook.test.ts`
  (exercises the new length-guard branch directly, confirming
  `timingSafeEqual` is never reached with mismatched buffer lengths), a
  full-success-path regression test in `tests/jobs/image-processing.test.ts`
  (seeds a `REJECTED` row, feeds it a genuinely valid image, confirms
  processing still respects the sweep's verdict rather than resurrecting
  it to `READY`), and a real-FK-violation test in
  `tests/notifications/notifications.test.ts` (a nonexistent `userId`
  triggers a genuine DB constraint failure, confirming `createNotification`
  returns `null` instead of throwing).
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified.
- `npm run build` — clean, warning-free production build; no new
  routes.

### Tests & Results (Phase 21, for reference)

- `npm run boundaries` — no violations (224 modules, 797 dependencies —
  +1 module for the new `src/lib/rate-limit.ts`, +3 dependencies for its
  three new call sites).
- `npm test` — **351/351 unit tests passing** across 46 files. New this
  phase: `tests/lib/rate-limit.test.ts` (3 — allows-then-rejects,
  independent keys, resets after a real wall-clock window), new
  `tests/catalog/images.test.ts` (4 — baseline `requestImageUploadTarget`
  coverage that didn't exist before, plus the rate-limit case), 2 new
  `createListing` tests (rate-limited after 20/hour, unaffected for a
  different owner), a new `checkBulkActionRateLimit` describe block in
  `tests/catalog/bulk-actions.test.ts` (2 — its 4 existing
  `bulkUpdateListings` tests untouched), and 3 new `submitVerificationRequest`
  tests in `tests/identity/verification.test.ts` (creates fresh when none
  pending, dedupes against an existing `PENDING` request, allows a new
  one after the prior is reviewed).
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified —
  `e2e/auth-signup.spec.ts`'s single verification-request submission
  hits the `alreadyPending: false` path unchanged.
- `npm run build` — clean, warning-free production build; no new
  routes.

### Tests & Results (Phase 20, for reference)

- `npm run boundaries` — no violations (223 modules, 794 dependencies —
  unchanged; this was a schema-only migration, no new module/dependency
  files).
- `npm test` — **337/337 unit tests passing** across 44 files —
  unchanged from Phase 19. No new tests: index-only migrations aren't
  unit-tested in this codebase's established convention (see
  `docs/DECISIONS.md`).
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified — a
  pure index addition changes query plans, never query results.
- `npm run build` — clean, warning-free production build; no new
  routes.
- `npx prisma migrate dev` (bare, no `--name`) — confirmed "already in
  sync" after the named migration.

### Tests & Results (Phase 19, for reference)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (223 modules, 794 dependencies —
  +1 for `catalog`'s new import of `settings/service.ts`, no new module
  files).
- `npm test` — **337/337 unit tests passing** across 44 files. New this
  phase: 2 tests in `tests/settings/settings.test.ts`
  (`requirePrePublishReview` defaults to `false`; an admin can turn it
  on independently of other settings) and 3 tests in
  `tests/catalog/listings.test.ts` (toggle-off regression proof —
  `createListing` still creates `ACTIVE`; toggle-on creates
  `PENDING_REVIEW` with a real `expiresAt`; a toggle-on listing flows
  through `listPendingReviewListings`/`decidePendingListing` to `ACTIVE`
  with `expiresAt` intact, unchanged).
- `npx playwright test` — **8/8 e2e specs passing**. One spec updated
  to match this phase's copy fix (`e2e/pending-review-flow.spec.ts`'s
  approve-button selector: "الموافقة وإعادة النشر" →
  "الموافقة والنشر") — caught by a full e2e re-run before this phase's
  final commit, not shipped broken.
- `npm run build` — clean, warning-free production build; no new
  routes.
- `npx prisma migrate dev` (bare, no `--name`) — confirmed "already in
  sync" after the named migration above.

### Tests & Results (Phase 18, for reference)

- `npm run boundaries` — no violations (223 modules, 793 dependencies —
  +1 dependency, no new module files).
- `npm test` — **332/332 unit tests passing** across 44 files. New this
  phase: `tests/catalog/favorites.test.ts` (3 — pagination + totals,
  per-user scoping, limit clamping for `listFavoriteListings`), plus a
  new `tests/identity/verification.test.ts` (3 — the same coverage for
  `getVerificationRequests`).
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified —
  including `store-management-flow.spec.ts`.
- `npm run build` — clean, warning-free production build; no new routes.
- `npx prisma migrate dev` (bare, no `--name`) — confirmed "already in
  sync" (no schema change this phase, so this was a pure sanity check).

### Tests & Results (Phase 17, for reference)

- `npm run boundaries` — no violations (223 modules, 792 dependencies —
  +1 for the new `src/components/ui/UrlPagination.tsx`).
- `npm test` — **326/326 unit tests passing** across 42 files. New this
  phase: `tests/orders/orders.test.ts` (5 — pagination + per-user
  scoping for both `listOrdersForBuyer`/`listOrdersForSeller`, clamping
  an out-of-range limit), plus 3 new tests in
  `tests/catalog/listings.test.ts` for `listListingsByOwner` (pagination
  + totals, scoping/soft-delete exclusion, limit clamping).
- `npx playwright test` — **8/8 e2e specs passing**, all unmodified —
  including `store-management-flow.spec.ts`, which exercises
  `/listings/mine` directly on its normal (single-page) path.
- `npm run build` — clean, warning-free production build; no new routes;
  `/orders`, `/dashboard/orders`, `/listings/mine` bundles grew slightly
  for the new pagination control.
- `npx prisma migrate dev` (bare, no `--name`) — confirmed "already in
  sync" (no schema change this phase, so this was a pure sanity check).

### Tests & Results (Phase 16, for reference)

- `npm test` — 318/318 unit tests passing across 41 files
  (`tests/jobs/listing-image-sweep.test.ts` +3,
  `tests/jobs/auth-row-pruning.test.ts` +2, one new
  `image-processing.test.ts` test, 3 new `listings.test.ts` tests).
- `npx playwright test` — 8/8 e2e specs passing, all unmodified.
- `npm run build` — clean, warning-free, no new routes.

### Tests & Results (Phase 15, for reference)

- `npm test` — 309/309 unit tests passing across 38 files
  (`tests/payments/providers.test.ts` +4, `tests/payments/paymob-webhook.test.ts`
  +7, plus one concurrency-regression test each in `checkout.test.ts`/
  `transitions.test.ts`).
- `npx playwright test` — 8/8 e2e specs passing, all unmodified.
- `npm run build` — clean, warning-free, no new routes.

### Tests & Results (Phase 14, for reference)

- `npm test` — 296/296 unit tests passing across 36 files
  (`tests/identity/email-normalize.test.ts` +10,
  `tests/identity/email.test.ts` +1, 4 new `notifications.test.ts` tests).
- `npx playwright test` — 8/8 e2e specs passing, `auth-signup.spec.ts` extended.
- `npm run build` — clean, warning-free; no new routes.
- `npx prisma migrate dev` (bare, no `--name`) — confirmed "already in
  sync" as the final gate, per the standing rule from Phase 13.

### Tests & Results (Phase 13, for reference)

- `npm test` — 281/281 unit tests passing across 34 files
  (`tests/search/saved-searches.test.ts` +5, `tests/jobs/search-indexing.test.ts` +1).
- `npx playwright test` — 8/8 e2e specs passing, all unmodified; two
  `playwright.config.ts` timeout fixes (`expect.timeout` 5s→15s, global
  `timeout` 60s→90s) — see `docs/DECISIONS.md`.
- `npm run build` — clean, warning-free, no new routes.

### Tests & Results (Phase 12, for reference)

- `npm test` — 275/275 unit tests passing across 34 files
  (`tests/search/saved-searches.test.ts`, `tests/jobs/search-indexing.test.ts` new).
- `npx playwright test` — 8/8 e2e specs passing, `e2e/saved-search-flow.spec.ts` new.
- `npm run build` — clean, warning-free, 3 new routes.

### Tests & Results (Phase 11, for reference)

- `npm test` — 263/263 unit tests passing across 32 files
  (`tests/identity/sms.test.ts` new, plus 2 new `notifications.test.ts` tests).
- `npx playwright test` — 7/7 e2e specs passing, all unmodified.
- `npm run build` — clean, warning-free, no new routes.

### Tests & Results (Phase 10, for reference)

- `npm test` — 259/259 unit tests passing across 31 files
  (`tests/catalog/pending-review.test.ts` new, plus 4 new
  `moderation.test.ts` tests).
- `npx playwright test` — 7/7 e2e specs passing, `e2e/pending-review-flow.spec.ts` new.
- `npm run build` — clean, warning-free, 3 new routes.

### Tests & Results (Phase 8, for reference)

- `npm test` — 242/242 unit tests passing across 30 files
  (`tests/lib/api-handler.test.ts` new, plus one OTP-logging test).
- `npx playwright test` — 5/5 e2e specs passing.
- `npm run build` — clean production build (76 routes, precisely counted
  from the build's own route table rather than eyeballed — prior phases'
  route-count figures in this file were rougher estimates; `/api/health`'s
  enhancement didn't add a route). Fixed a real webpack warning
  introduced by adding Sentry (OpenTelemetry's dynamic `require()`) via
  `serverExternalPackages` — build is warning-free, not just
  error-free.
- Adversarially re-validated: a first pass of the `withApiHandler`
  generic (`Ctx = undefined`) broke Next.js's own route-handler type
  validation for every route with no `context` parameter — caught by
  `npm run typecheck` against `.next/types/validator.ts` before it ever
  reached a build or test run; fixed by changing the default to
  `Ctx = unknown` (contravariantly compatible with any context shape
  Next.js actually passes).

## Known Issues

### Open

- None. (The `OrderCancelledBy`/`ShippingRate` issues from Phase 5, the
  client-bundle issue from Phase 7, the OTP-logging issue from Phase 8,
  the `withApiHandler` generic-default issue from Phase 8, the
  `getListingById` visibility gap from Phase 10, the checkout/
  order-transition double-write races from Phase 15, and the
  `createListing` count-then-create race from Phase 16 were all found
  and fixed within their own development pass, never shipped.)

### Deferred (not bugs — explicit scope decisions)

- **Five lower-severity unrated endpoints from the Phase 21
  rate-limiting audit, not fixed**: `POST /api/listings/[id]/favorite`
  (a cheap toggle bounded to one row per user/listing — a DB-load
  concern, not content spam), `POST /api/saved-searches`, `POST
  /api/listings/[id]/images/confirm`, `POST /api/listings/[id]/renew`
  (all lower-impact write paths with no third-party amplification), and
  `POST /api/orders` (`createOrder` already atomically reserves the
  listing to `SOLD`, so at most one successful order can ever exist per
  listing — the "spam orders against one listing" attack shape is
  already naturally capped; a real attack would need many distinct
  valid listings, a materially more expensive threat). Revisit only if
  a fresh audit finds one of these risk profiles has materially
  changed.
- **Three lower-value composite-index candidates from the Phase 20
  audit, not added**: the `Listing` pending-review queue (`status,
  updatedAt` — admin-only, low volume), `Subscription` (`userId, status,
  currentPeriodEnd` — small per-user row count), `ShippingSettlement`
  (`periodStart` — one row per company per settlement period, genuinely
  low volume). Revisit only if one of these tables' real growth pattern
  changes.
- ~~A `ListingImage` can get stuck at `PENDING` forever if its processing
  job exhausts all 3 retry attempts~~ — **resolved in Phase 16**: an
  hourly `listing-image-sweep` job flips anything still `PENDING` past 1
  hour old to `REJECTED`.
- ~~No pruning job for expired `OtpCode`/`Session` rows~~ — **resolved in
  Phase 16**: an hourly `auth-row-prune` job deletes both once past
  `expiresAt`.
- ~~Three unbounded (unpaginated) list queries: `listOrdersForBuyer`/
  `listOrdersForSeller`/`listListingsByOwner`~~ — **resolved in Phase
  17**: all three now follow the same `{ items, page, totalPages,
  totalCount }`/`DEFAULT_LIMIT`(20)/`MAX_LIMIT`(100) pattern already used
  everywhere else, with a matching `UrlPagination` control on their three
  pages and updated API routes.
- ~~Two more unbounded (unpaginated) list queries found by a follow-up
  audit: `listFavoriteListings`/`getVerificationRequests`~~ — **resolved
  in Phase 18**: both now follow the same pagination shape/clamp. No
  `UrlPagination` UI was added for verification requests (structurally
  bounded row count per user); favorites still has zero UI consumer,
  same as Phase 17's three routes before this fix.
- **`GET /api/admin/shipping-companies` and `GET /api/admin/plans` are
  unbounded** (found in the same Phase 18 audit). Deliberately not
  fixed: these are small, admin-managed reference tables, not
  user-generated "list my own data" — a different growth pattern and
  risk profile than everything else in this pagination thread. Revisit
  only if either table's row count becomes genuinely large in practice.
- **`GET /api/admin/ledger` is capped at 50 rows with no further page**
  (found in the same Phase 18 audit). A real gap, but a separate,
  admin-only concern outside the scope of the "list my own data" audits
  this thread has been running — not fixed this phase.
- **`toFixed(2)`-based money rounding in `src/modules/shipping/commission.ts`**
  has the well-known IEEE-754 half-cent edge case. Found in Phase 16's
  audit; not a newly-introduced bug — every money value in this codebase
  already round-trips `Decimal` → `Number()` the same way, so this is a
  pre-existing, systemic pattern, not worth a special-case fix in one
  function while leaving the same pattern everywhere else. Revisit only
  if real settlement data ever shows a discrepancy.

- **Sentry is architecturally complete but inactive** — see "OWNER
  DECISION REQUIRED" below. Every other observability feature (request
  logging, request-id correlation, error boundaries, safe error
  responses) works today regardless.
- **`next.config.ts` is not wrapped with `withSentryConfig`** — that's
  for build-time source-map upload and needs
  `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`, separate from the
  DSN itself. Sentry works without it; stack traces in the dashboard
  just won't be source-mapped to the original TypeScript until it's
  added.

- ~~Saved-search matching can send a repeat notification when a listing
  is edited~~ — **resolved in Phase 13**: a new `SavedSearchNotification`
  table dedupes on `(userId, listingId)`, claimed before every
  `createNotification` call.

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
  relying on it in production. The webhook now also independently
  verifies paid amount/currency against the order (Phase 26) — re-verify
  that `amount_cents`/`currency` are the correct payload field names/
  units against the real sandbox at the same time.
- ~~No refund/return financial-reversal logic~~ — **confirmed NOT
  IMPLEMENTED, not a bug, in Phase 26's audit**:
  `RETURNED`/`REFUNDED`/`DISPUTED` exist as wired state-machine
  transitions with zero ledger/listing-reactivation/Paymob-refund logic
  behind them, matching `docs/BUSINESS_MODEL.md` §8's explicit
  "not built — currently free for both parties" (see D7/D8 below —
  this is an open owner decision, not a technical gap to close
  unilaterally).
- **New listings still publish straight to `ACTIVE` by default; there is
  no *mandatory* pre-publish review gate turned on** — Phase 10 gave
  moderators a reversible `PENDING_REVIEW` escalation (`FLAG_FOR_REVIEW`,
  off a report) as a genuine third option alongside dismiss/remove.
  Phase 19 added the technical capability for a mandatory gate
  (`PlatformSettings.requirePrePublishReview`, default `false`) at the
  owner's explicit request to build scaffolding without flipping the
  default. Forcing every new listing through moderator approval before
  it's visible is a real product/velocity trade-off (core marketplace
  loop vs. trust posture) — the capability now exists, but **turning it
  on remains OWNER DECISION REQUIRED**; nothing in this codebase flips
  it automatically.
- ~~No rate limiting on `POST /api/reports` beyond same-target dedupe~~ —
  **resolved in Phase 9**: a per-reporter Redis sliding-window limit (20
  reports/hour, mirroring the OTP rate limiter) now blocks spamming
  reports against many different targets.
- ~~No notification fires when a report is resolved or a verification
  request is decided~~ — **resolved in Phase 7**: both now fire an
  in-app `Notification`.
- ~~Notifications are in-app only — no email/SMS delivery for anything
  except OTP~~ — **resolved in Phase 11 for SMS**: every notification
  also attempts an SMS via the now general-purpose `SmsProvider`,
  vendor-agnostic and inert until a real gateway is configured (see
  `docs/DECISIONS.md`). **Email is still not built** — no provider
  decision has been made for it, and phone-first Egyptian SMS was the
  more natural extension of infrastructure that already existed
  (`SmsProvider`, `User.phone`) than adding an unused `User.email`
  field would have been.
- **No notification preferences/mute** — every trigger always fires for
  every user; there's no way for a user to opt out of a notification
  type. Not urgent at current volume; revisit if it becomes a
  complaint.
- **Several admin/config-mutation audit entries record only the
  new/submitted values, never the prior state** (found in the Phase 23
  audit): `settings.update`, `shipping_company.update`,
  `shipping_rate.upsert`, `shipping_commission_rule.update`,
  `subscription_plan.update`, and `subscription.revoke` (which records
  only the subscription id, not the affected `userId`/`planId`). "What
  did this change *from*" isn't reconstructable from `AuditLog` alone
  for any of these — only "what it changed *to*." Closing this properly
  means reading the pre-update row in three separate modules
  (`settings`, `shipping`, `subscriptions`) before each write — a real,
  legitimate improvement, but a distinctly larger, separate unit of work
  than Phase 23's single clearly-scoped Listing-audit fix.
  `admin.verification.approve`/`reject`'s metadata also doesn't mirror
  the reviewer's `notes` text — same reasoning, deferred.
- ~~`getUserDetail()`'s unscoped `prisma.user.findUnique` over-fetches a
  few low-sensitivity fields~~ (`email`, `phoneVerifiedAt`, `deletedAt`,
  `updatedAt`) beyond what `UserDetail.tsx` reads (found in the Phase 24
  audit) — **resolved in Phase 25**: an explicit `select` now scopes the
  query to exactly the 7 fields the admin page reads.

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

## Technical/Architecture Decisions (Phase 8)

See `docs/DECISIONS.md` for full rationale. Summary:

- Every API route is wrapped with `withApiHandler` rather than logging
  ad hoc per-route, because Next.js's App Router has no
  "before-and-after-every-request" hook for Route Handlers specifically
  (`middleware.ts` only runs before, in the Edge runtime;
  `onRequestError` only fires on error) — wrapping is the only way to get
  true start/complete/error lifecycle logging.
- The mechanical rewrite of all 51 route files used a one-off Node script
  built on the TypeScript compiler API, not regex/brace-counting, because
  several routes have template-literal interpolation
  (`` `store.branding.${kind}` ``) inside their bodies that would confuse
  a naive brace-counter.
- `ConsoleSmsProvider` no longer logs the OTP code — it was a live
  secret-in-logs risk, not a style preference, and removing it cost
  nothing functionally since the dev/test path never read it from logs.
- Every `Sentry.init()` call is behind an explicit `if (dsn is set)`
  guard rather than trusting the SDK's own no-DSN no-op behavior — the
  same "build the infrastructure, never activate without real
  credentials" principle already applied to Paymob.

## Technical/Architecture Decisions (Phase 9)

See `docs/DECISIONS.md` for full rationale. Summary:

- `SiteHeader`'s desktop and mobile navs read from one shared
  `nav-links.ts` list rather than each hardcoding its own — the
  drift-prone alternative (two separate link lists) was rejected up
  front, not fixed after the fact.
- `MobileNav`'s panel uses plain `fixed inset-x-4` positioning, not an
  LTR/RTL-aware centered-transform scheme, because this app has no LTR
  mode at all (`<html lang="ar" dir="rtl">` unconditionally).
- Report rate limiting is a per-reporter Redis sliding window (mirroring
  the OTP limiter), separate from and in addition to the existing
  same-target dedupe check — the dedupe alone doesn't stop spam against
  many different targets, and the rate limit alone wouldn't give a clean
  "you already reported this" response.
- The rate-limit counter is incremented only on a genuinely new report,
  never on the dedupe (`alreadyOpen: true`) path — re-reporting the same
  target isn't the abuse pattern being guarded against.

## Technical/Architecture Decisions (Phase 10)

See `docs/DECISIONS.md` for full rationale. Summary:

- `FLAG_FOR_REVIEW` is a new, distinct `resolveReport()` action, not a
  variant of `REMOVE_LISTING` — the two have different reversibility
  (`deletedAt` set vs. not) and that difference stays visible at the call
  site rather than hidden behind a boolean flag.
- `decidePendingListing` is its own standalone moderator action off a new
  queue, not folded into `resolveReport` — by the time a listing is
  decided it may have multiple reports against it, or none tied to the
  specific decision; the queue works off the listing's own status.
- `getListingById` now takes the viewer's id *and* role, gating
  visibility on both ownership and a `MODERATOR`/`ADMIN` override — not
  just an owner check — because a moderator genuinely needs to see
  content they're moderating, not just their own.
- Deliberately did **not** make pre-publish review mandatory for every
  new listing — that's a product/velocity trade-off, not a technical one;
  flagged as a possible future **OWNER DECISION REQUIRED** in Known
  Issues rather than decided unilaterally.
- Playwright's global test timeout raised to 60s after confirming a
  pre-existing spec's intermittent failure was cold-compile time on this
  sandbox, not a real hang.

## Technical/Architecture Decisions (Phase 11)

See `docs/DECISIONS.md` for full rationale. Summary:

- The real SMS provider (`HttpSmsProvider`) is a vendor-agnostic HTTP POST
  (`{ to, message }` + bearer token), not a specific gateway's documented
  API like `PaymobProvider` is for Paymob — no SMS vendor has been chosen
  for this project, and guessing one's exact contract risks the same
  "unverified against a real sandbox" problem already flagged for Paymob,
  with an added layer of guessing *which* vendor.
- `createNotification()` sends an SMS mirror for every `NotificationType`,
  not a curated allowlist — simpler, has an obvious undo once real
  usage/cost data exists, and never risks silently skipping something
  that turns out to matter.
- Accepted a real circular import (`notifications/service.ts` ⇄
  `identity/service.ts`) rather than restructuring around it, after
  confirming it's safe both structurally (hoisted `function` exports on
  both sides) and empirically (full test suite passes) — restructuring a
  working, safe pattern to avoid a cycle dependency-cruiser doesn't even
  flag would have been effort spent on a non-problem.

## Technical/Architecture Decisions (Phase 12)

See `docs/DECISIONS.md` for full rationale. Summary:

- `SavedSearch.query` stores `RawSearchParams` (slugs) rather than
  resolved `SearchFilters` (real IDs) — stable across data changes, and
  matches the exact shape `/api/search` already accepts.
- Saved-search matching is a cheap field predicate (category/governorate/
  city by slug, price range, a normalized text substring check), not a
  live `PostgresSearchProvider.search()` call per saved search per new
  listing — that would scale with total saved searches, not with
  anything about the new listing.
- One notification per matching *user*, never per matching *saved
  search* — a user with several matching saved searches for the same
  listing gets one notification, not several.
- A migration folder's timestamp must sort after everything it
  structurally depends on, not just reflect when it was created — a real
  bug (not a hypothetical), found and fixed this phase; see "Bug Found
  and Fixed in Phase 12" above and `docs/DATABASE.md` for the rule this
  establishes for every future migration.

## Technical/Architecture Decisions (Phase 13)

See `docs/DECISIONS.md` for full rationale. Summary:

- `SavedSearchNotification` is keyed by `(userId, listingId)` with no
  relation to `SavedSearch` at all, not `(savedSearchId, listingId)` —
  the dedup guarantee is "this user was told about this listing," which
  must survive `deleteSavedSearch` unaffected.
- Claimed via an insert-and-catch-`P2002` pattern (already established
  in `src/modules/store/store.ts`), not a check-then-insert — atomic
  under concurrent overlapping jobs for the same listing.
- A new table, not a `listingId` column bolted onto `Notification` —
  keeps the dedup concept owned entirely inside the `search` module,
  mirroring `Favorite`'s exact shape rather than mixing a
  search-specific concern into `notifications`' shared, single write
  path.
- The Phase 12 migration-ordering bug recurred once, in the very next
  migration created after that fix, because `prisma migrate dev`'s
  shadow-database check at creation time only validates migrations
  already on disk — it never re-verifies the new migration's own folder
  position. The standing rule is now: always finish migration work with
  a bare, no-argument `npx prisma migrate dev` and require "already in
  sync" as the result, not just a successful named run.
- Two Playwright config fixes (`expect.timeout` 5s→15s, global `timeout`
  60s→90s) came out of chasing what first looked like pure flakiness
  during this phase's own validation — both root-caused to genuine
  sandbox timing gaps (confirmed via failure snapshots and isolated
  longer-timeout re-runs showing real, if slow, completion), not
  dismissed as "the sandbox is just flaky" without checking.

## Technical/Architecture Decisions (Phase 14)

See `docs/DECISIONS.md` for full rationale. Summary:

- `User.email` is optional and **not** `@unique` — a delivery address,
  never an identity key. Phone stays the sole login credential; two
  accounts sharing a mailbox (e.g. a family shop) must stay possible.
  No `emailVerifiedAt` either — no collect-then-verify UI exists yet, so
  an always-`null` column would be the same "looks real, does nothing"
  anti-pattern already rejected for delivery itself.
- `EmailProvider` mirrors `SmsProvider` exactly: same
  console/HTTP-provider split, same vendor-neutral `{ to, subject, text }`
  POST contract (no vendor named — zero email SDK deps in
  `package.json`), same env-var-presence gating (optional everywhere,
  never required in production), same singleton-cache selection.
- SMS and email are dispatched **concurrently** (`Promise.allSettled`),
  each independently try/caught, not in series — two inline network
  calls in series would double the added latency on every
  notification-creating request path for no benefit, since neither
  channel depends on the other's outcome.
- Inline/best-effort, not a new BullMQ queue — matches SMS's existing
  treatment; queuing email is a legitimate but distinct architectural
  call, explicitly out of scope this phase.
- Collected through the existing `/profile` page (the only self-service
  profile surface), not a new page — mirrors the already-shipped `name`
  field's save flow exactly.

## Technical/Architecture Decisions (Phase 15)

See `docs/DECISIONS.md` for full rationale. Summary:

- `createOrder`'s listing reservation moved from "create order, then
  update listing" to "atomically reserve the listing, then create the
  order, both in one transaction" — the reservation's `WHERE status:
  "ACTIVE"` guard is the actual concurrency control (Postgres serializes
  concurrent UPDATEs on the same row); the transaction wrapper exists so
  a failure creating the order can't leave the listing stuck reserved
  with nothing to show for it.
- `transitionOrder`'s status write changed from a plain `update` to an
  `updateMany` guarded on the status actually read — the general fix for
  read-then-write races on a row whose state gates a real side effect,
  applied here for order transitions specifically; it also makes
  `recordCompletionFinancials` idempotent for free, with no separate
  idempotency key.
- The Paymob webhook's `merchant_order_id` field is read from two
  possible locations (nested, then a top-level fallback) rather than
  asserting one — an honest response to not being able to confirm
  Paymob's real payload shape from this environment (network egress to
  their docs is blocked), not a guess presented as fact.
- `payments` module tests validate `verifyWebhook`'s parsing/HMAC logic
  against a synthetic, self-computed-HMAC payload — deliberately not a
  claim that this matches Paymob's real API (that's still gated on live
  sandbox access), just proof the code does what it says with whatever
  shape it's given.
- Two minor findings from this phase's audit (orphaned `PENDING`
  `ListingImage` rows past retry exhaustion; no `OtpCode`/`Session`
  pruning job) were deliberately left unfixed and moved to Known
  Issues/Deferred rather than folded in — neither is a correctness bug,
  and scope discipline (one phase, completable in one clean pass) beats
  fixing everything found in a single audit.

## Technical/Architecture Decisions (Phase 16)

See `docs/DECISIONS.md` for full rationale. Summary:

- The `ListingImage` sweep and `OtpCode`/`Session` pruning jobs both
  copy `listing-expiry.ts`'s exact BullMQ repeatable-job shape rather
  than inventing a new pattern — a plain sweep function, a dedicated
  queue, a worker registered via `queue.add()` with a fixed `jobId` +
  `repeat`.
- A stuck `ListingImage` is marked `REJECTED` (reusing the existing
  terminal state), not re-queued — re-queuing indefinitely risks
  infinite retries on a permanently-broken file. Expired auth rows are
  hard-deleted, not moved to a terminal status — unlike
  `Listing`/`ListingImage`, nothing reads them for history once expired.
- The upload-size check happens via a new `getObjectSize()` on
  `StorageProvider`, called **before** `getObject()` in
  `processListingImage` — checking after would already have paid the
  memory cost of the oversized buffer, which is the actual vector being
  closed. 15 MB is a technical default (generous for a real phone-camera
  photo, still bounding worst-case per-job memory), not a product call.
- `createListing`'s active-listing-limit race is a count-then-create
  race against an aggregate, not a single row's state transition — the
  `updateMany`-with-WHERE-guard pattern Phase 15 used for checkout/
  transitions doesn't apply here. Fixed with a `Serializable`-isolation
  transaction plus a single retry on Postgres's own conflict detection
  (error `40001`/Prisma `P2034`), not an application-level guard.
- Two further findings from this phase's audit (unpaginated
  `listOrdersForBuyer`/`listOrdersForSeller`/`listListingsByOwner`; a
  systemic `toFixed(2)` money-rounding pattern) were deliberately left
  unfixed — the pagination gap is scoped to the caller's own data (not a
  security issue) and touches 9 files to fix properly; the rounding
  pattern is pre-existing everywhere in the codebase, not newly
  introduced. Both moved to Known Issues/Deferred rather than folded in,
  keeping this phase completable in one clean pass.

## Technical/Architecture Decisions (Phase 17)

See `docs/DECISIONS.md` for full rationale. Summary:

- The three newly-paginated functions use the exact `{ items, page,
  totalPages, totalCount }` shape and `DEFAULT_LIMIT`(20)/`MAX_LIMIT`(100)
  clamp already established by `listNotifications`, search, saved
  searches, and the moderation/pending-review queues — no new pattern
  invented for three functions that happened to be the only holdouts.
- A single new `UrlPagination` component, not three near-identical
  one-off wrappers — `SearchPaginationClient` already solved "paginate
  via the URL's `?page=` param" for `/search`, but hardcodes that path;
  `UrlPagination` uses `usePathname()` instead so it works for any page.
  `/search`/`SearchPaginationClient` were left untouched rather than
  refactored onto the new component — that would have been unrelated
  scope creep, not something this task required.
- The three affected API routes' response shape changed (a bare
  array/`{ orders }` → the paginated shape). Verified via grep this
  breaks no caller: none of the three routes are consumed by any
  client-side code in this app — the corresponding pages call the
  module functions directly as Server Components. The routes exist
  purely as part of the documented API surface for a future mobile
  client (see `docs/ARCHITECTURE.md`).

## Technical/Architecture Decisions (Phase 18)

See `docs/DECISIONS.md` for full rationale. Summary:

- Same shape/clamp convention as Phase 17 — no new pattern invented for
  the two additional holdouts a follow-up audit found.
- No pagination UI for `getVerificationRequests`: a user's own
  verification-request count is structurally bounded to a handful over
  an account's lifetime, so `UrlPagination` there would be
  over-engineering — a deliberate, judged exception to "every paginated
  list needs a page control," not an oversight.
- `GET /api/admin/shipping-companies`/`GET /api/admin/plans` (unbounded
  reference tables) and `GET /api/admin/ledger` (50-row cap, no further
  page) were investigated and explicitly left out of scope — a
  different risk profile (small admin-managed data / a separate
  admin-only concern) than the user-generated "list my own data"
  pattern this audit thread has been closing.

## Technical/Architecture Decisions (Phase 19)

See `docs/DECISIONS.md` for full rationale. Summary:

- `requirePrePublishReview` is a non-nullable `Boolean @default(false)`
  — the first plain toggle in `PlatformSettings` — rather than the
  nullable-fails-open pattern used for prices/enums, since a switch has
  no meaningful third "unconfigured" state.
- `expiresAt` is set immediately at creation regardless of starting
  status, so `decidePendingListing`'s `APPROVE` branch (built for the
  report-driven flagging path, which never touches `expiresAt`) needed
  zero changes to correctly handle a listing that starts life at
  `PENDING_REVIEW` directly — proven by a new regression test.
- Two Arabic UI strings that assumed a listing was previously live
  before reaching pending review were fixed to read correctly for both
  the report-driven and toggle-on paths.
- This is scaffolding only: the default stays `false`, so no live
  marketplace behavior changed. Turning it on remains the owner's
  decision — see "OWNER DECISION REQUIRED" below.

## Technical/Architecture Decisions (Phase 20)

See `docs/DECISIONS.md` for full rationale. Summary:

- Twelve composite indexes, each targeting a real, named query call
  site — not a speculative index on every possible filter combination.
- `Listing`'s public search/browse path got exactly two composites
  (default recency browse, price-sorted browse), not one per possible
  narrowing combination, since Postgres can only use one composite
  index efficiently per query.
- Old, now-partially-redundant single-column indexes were deliberately
  left in place rather than dropped — a separate, lower-value cleanup
  with its own small risk, out of scope for this pass.
- No test changes: index-only migrations have never been unit-tested in
  this codebase's established convention.

## Technical/Architecture Decisions (Phase 21)

See `docs/DECISIONS.md` for full rationale. Summary:

- A new shared `checkRateLimit()` utility for new call sites; the two
  existing hand-rolled limiters (`requestOtp`, `createReport`) are
  deliberately left untouched since both have compound logic beyond a
  single window check.
- Three threshold values (20/hour listing-create, 60/hour upload-URL,
  30/hour bulk actions) reasoned against realistic legitimate usage —
  technical anti-abuse defaults, not commercial policy.
- The bulk-action rate limit is checked at the API route boundary, not
  inside `bulkUpdateListings`, specifically to avoid a breaking change
  to its existing tested return shape.
- `submitVerificationRequest`'s new any-type `PENDING` dedupe, modeled
  on `createReport`, is a root-cause fix rather than a rate-limit
  band-aid — there's no legitimate reason for a user to have more than
  one `PENDING` request at once.
- `createStore`'s existing `Store.ownerId @unique` constraint was
  confirmed sufficient — no separate rate limit added.
- A separate, fresh IDOR/authorization audit run in the same session
  found no gap across all 55 API routes.

## Technical/Architecture Decisions (Phase 22)

See `docs/DECISIONS.md` for full rationale. Summary:

- Paymob's HMAC comparison now uses `crypto.timingSafeEqual` with an
  explicit length check first (which itself would throw on mismatch).
- `processListingImage`'s three status-setting writes now guard on
  `status: "PENDING"` via `updateMany`, matching this codebase's
  established guarded-write pattern elsewhere.
- `createNotification` now isolates its own `Notification`-row write
  failure the same way its SMS/email dispatch was already isolated —
  returns `null` instead of throwing; no caller inspects the return
  value, so this is non-breaking.
- The saved-search claim-then-notify pattern's narrower, lower-severity
  consequence (a claimed-but-unsent notification stays silently lost)
  was investigated and accepted as a documented trade-off rather than
  fixed with transactional claim+notify machinery.
- Background-job idempotency and Paymob webhook duplicate-processing
  were both independently confirmed already correct — no changes
  needed there.

## What Was Completed in Phase 24 (audit only, no code change)

Two more fresh audits, targeting the last two candidates named in
Phase 23's Exact Next Action: CSRF coverage completeness (exhaustively
this time, not spot-checked) and frontend authorization-assumption
leaks. Both came back fully clean, confirmed by reading the actual
code, not assumed:

- **CSRF coverage**: all 40 `route.ts` files under `src/app/api/**`
  with a mutating (`POST`/`PATCH`/`PUT`/`DELETE`) handler were checked
  individually. 37 correctly call `assertCsrf(request)` before their
  mutation. The 3 that don't are each legitimately exempt for a
  distinct, verified reason: the Paymob webhook authenticates via HMAC
  signature, not a session cookie; `otp/request`/`otp/verify` run
  *before* a session (and its CSRF cookie) exists, an inherent
  exemption for login endpoints under a double-submit scheme; and the
  dev-only local-storage upload stub has no session auth at all and is
  hard-disabled in production. No gap.
- **Frontend authorization-assumption leaks**: every admin page either
  performs its own explicit `requireAdmin()`/`requireModerator()`
  server-side check before fetching data, is protected by the shared
  layout's server-side `requireModerator()` gate (which runs ahead of
  any child render) plus its own independently-gated API routes, or
  both. Every client-side role check that drives button visibility
  (e.g. `UserDetail.tsx`'s admin-only status/role controls) is backed
  by an equivalent, independently-enforced check on the actual mutating
  route, so tampering with client state to reveal a hidden button still
  gets rejected server-side. Every Server Component that sends data to
  a client component does so via a Prisma `select` scoped to what that
  viewer should see (e.g. `getListingById`'s owner projection excludes
  role/status/email), not a full row gated only by a client-side `if`.
  No gap.

One trivial, non-blocking nit was noted, not fixed: `getUserDetail()`
(`src/modules/identity/admin-users.ts`) does an unscoped
`prisma.user.findUnique` for the admin user-detail page, so a few extra
low-sensitivity fields (`email`, `phoneVerifiedAt`, `deletedAt`,
`updatedAt`) are serialized into the API response beyond what
`UserDetail.tsx` actually reads. This is data-minimization hygiene, not
an authorization gap — the endpoint is already correctly restricted to
moderators/admins who are authorized to see this user's data regardless.
Deferred to Known Issues rather than spending a full validate/commit/
merge cycle on a `select` clause with no security or functional impact.

This is the **second consecutive fully-clean audit round** this
session (the first being background-job idempotency and Paymob webhook
duplicate-processing in Phase 22's audit set). Combined with IDOR/
authorization (clean, before Phase 20), session/cookie security (clean,
Phase 23's round), and N+1 queries (clean, Phase 23's round), six of
the eleven fresh audits run across Phases 20-24 found nothing — a
meaningfully different signal than earlier phases, where nearly every
audit found something. See "Exact Next Action" below for what this
means for a future session.

## What Was Completed in Phase 25

Closed the one cosmetic finding from Phase 24's frontend
authorization-leak audit: `getUserDetail()`
(`src/modules/identity/admin-users.ts`) now scopes its
`prisma.user.findUnique` with an explicit `select` covering exactly the
7 fields the admin user-detail page
(`src/app/admin/users/[id]/UserDetail.tsx`) reads (`id`, `name`,
`phone`, `role`, `status`, `commerceVerifiedAt`, `createdAt`) —
`email`, `phoneVerifiedAt`, `deletedAt`, and `updatedAt` are no longer
serialized into the `GET /api/admin/users/[id]` response. No other
consumer of `getUserDetail`'s return type exists, so the one real
caller's response shape is unchanged in structure, only narrower in
the fields it excludes. No business logic, authorization, or migration
changed. Data-minimization hygiene only — not a fix for an actual
authorization gap, since the endpoint was already correctly restricted
to moderators/admins who are entitled to see this user's data.

## What Was Completed in Phase 27

With the technical/security audit backlog largely closed (Phases 20-26:
7 of 11 fresh audits fully clean, financial-integrity 5-of-7 clean),
this session ran a product-gap prioritization pass instead of another
audit round, per the owner's explicit direction. The clearest,
best-evidenced, owner-independent gap: a "my favorites" page.
`toggleFavorite`/`listFavoriteListings` and a paginated
`GET /api/favorites` have existed since Phase 3/18 and every listing
detail page has had a working "add to favorites" button the whole
time — but no page anywhere let a user view the list of listings
they'd favorited. `docs/API.md` had explicitly flagged this as
"no UI consumer exists yet" since Phase 18. No pricing, commission, or
business-policy decision was needed — this was purely wiring an
already-built, already-tested backend to a missing frontend page.

- **New `/favorites` page** (`src/app/favorites/page.tsx` +
  `FavoritesGrid.tsx`) — mirrors the established "my own paginated
  list" pattern (`/listings/mine`, `/orders`, `/saved-searches`):
  auth-gated Server Component, `UrlPagination`, a card grid matching
  `/search`'s result-card visual pattern, a status badge for any
  favorited listing that's since gone `SOLD`/etc., and a "remove from
  favorites" button per card using the existing toggle endpoint.
- **New nav link** — added once to the single shared `NAV_LINKS.loggedIn`
  array (`src/components/layout/nav-links.ts`), so both the desktop nav
  and the mobile hamburger menu pick it up automatically with no risk
  of the two drifting apart.
- **Fixed a related bug found while building this**: the listing detail
  page's favorite button always rendered "not favorited" on load
  regardless of the viewer's actual prior state (`useState(false)`,
  never checked against the DB). Fixed with a new, small, unit-tested
  `isListingFavorited()` function threaded down as an `initialFavorited`
  prop — directly in the same feature area this phase was already
  touching, not scope creep.
- No financial value, commission, or business policy touched anywhere
  in this phase.

## What Was Completed in Phase 26

Per the owner's "continue the work fully" instruction, completed the
financial/business-logic integrity audit that an earlier session in
this run had started but never finished (the background agent was
interrupted mid-task with no result ever delivered). Re-ran it to
completion across 7 checks:

- **Clean**: order state machine (exhaustive, correctly guarded
  transitions; money snapshotted once at checkout, never re-read live;
  the Phase 15 double-sell fix confirmed still correctly in place),
  ledger (every entry explicitly tagged `account`, revenue aggregation
  correctly filtered to `PLATFORM_REVENUE` only), subscriptions (no
  auto-charge/cron logic anywhere — purely admin-driven grant/revoke,
  pricing always DB-read), shipping commission (computes only the
  percentage of the fee, never the fee itself; the Phase 5
  nullable-governorate fix confirmed still correctly in place), and
  hardcoded financial values (none found anywhere in application code
  — every price/percentage/commission/fee traced to an owner-configured
  DB field).
- **Real gap found and fixed**: the Paymob webhook never cross-checked
  the paid `amount_cents`/`currency` against the target order's own
  `totalAmount`/`currency` before marking it `CAPTURED` — a valid HMAC
  signature only proves the payload is authentically from Paymob, never
  that the amount applies to that specific order. Fixed by extending
  `WebhookVerificationResult` with `amountCents`/`currency`, adding a
  new pure, unit-tested `webhookAmountMatchesOrder()` function
  (`src/modules/payments/webhook-amount.ts`), and having the route
  refuse (log + leave `PENDING`) rather than capture on any mismatch.
  Zero production behavior change today — the whole route already
  returns `503` until real Paymob credentials exist — but the gap is
  now closed before online payments ever go live, not after.
- **Confirmed NOT IMPLEMENTED, not a bug**: refund/return handling.
  `RETURNED`/`REFUNDED`/`DISPUTED` exist as wired state-machine
  transitions with zero financial reversal logic behind them, matching
  `docs/BUSINESS_MODEL.md` §8's explicit "not built — currently free
  for both parties." Not built this phase — it's a larger, separate
  unit of work with its own open owner-facing questions (a
  cancellation/refund fee policy) already flagged in that document.

## Technical/Architecture Decisions (Phase 23)

See `docs/DECISIONS.md` for full rationale. Summary:

- `adminRemoveListing`/`flagListingForReview` now self-audit against the
  `Listing` they mutate (audit inside the function that holds the
  authority, mirroring `setUserStatus`'s existing pattern), rather than
  relying solely on the caller's Report-level audit entry.
- Both functions gained a required `actorId` parameter — previously
  neither took one, since neither had ever needed to audit.
- `admin.report.resolve`'s own metadata now also records
  `listingId`/`targetUserId`, so the Report-level entry is
  self-describing about its target even though the authoritative,
  entity-keyed record now lives on the Listing/User itself.
- `setUserStatus`'s audit entries now record `{from, to}`, matching
  `setUserRole`'s existing convention in the same file, so a
  `SUSPENDED → BANNED` escalation is distinguishable from `ACTIVE →
  BANNED` directly from `AuditLog`.
- Session/cookie security and N+1 query patterns were both independently
  audited and confirmed already correct — no changes needed there.

## Technical/Architecture Decisions (Phase 26)

See `docs/DECISIONS.md` for full rationale. Summary:

- `WebhookVerificationResult` now carries `amountCents`/`currency` from
  the (HMAC-verified) payload, so a caller can independently cross-check
  them — a signature alone proves authenticity, never applicability to
  a specific order.
- The comparison itself lives in a new, small, pure, unit-tested
  function (`webhookAmountMatchesOrder`) rather than inline in the
  route, matching this codebase's established "business logic in the
  module, not the route handler" convention. Compares in cents (the
  gateway's native unit) rather than converting cents to a float, to
  avoid floating-point comparison entirely.
- On a mismatch, the route logs an error and leaves the order `PENDING`
  rather than either capturing it or marking it `FAILED` — the order's
  true payment state is genuinely unknown in that scenario, and forcing
  it to either terminal state would be a guess; `PENDING` is the
  already-accurate "not yet confirmed" state and requires no new enum
  value or admin-facing "investigate" queue to be built for this phase.
- Order-state-machine, ledger, subscriptions, and shipping-commission
  logic were all independently re-audited and confirmed already
  correct — no changes needed there. Refund/return handling was
  confirmed genuinely unbuilt (not a bug) and intentionally left
  alone — it's a larger, separate unit of work gated on an open owner
  decision (D7/D8 below).

## Technical/Architecture Decisions (Phase 27)

See `docs/DECISIONS.md` for full rationale. Summary:

- The favorites grid reuses `/search`'s exact card visual pattern
  (`Card`/`Image`/`PriceTag` composition) rather than inventing a new
  one, and the page/pagination shell reuses the established
  "my own paginated list" pattern (`/listings/mine`, `/orders`,
  `/saved-searches`) — no new UI pattern introduced for this feature.
- The new nav link was added to the single shared `NAV_LINKS.loggedIn`
  array rather than editing `SiteHeader.tsx`/`MobileNav.tsx` directly,
  so both nav surfaces stay in sync automatically, matching how every
  other nav entry is already maintained.
- `isListingFavorited()` was added as its own small function (not
  folded into `getListingById` or `toggleFavorite`) since it's a
  single, cheap, independently-reusable check — the same shape as
  `toggleFavorite`'s own internal existence check, just exposed for a
  second caller (the page) to use without mutating anything.
- This phase deliberately chose a product-gap fix over another audit
  round, per the owner's explicit Phase 27 instruction — the technical/
  security audit backlog was treated as sufficiently covered (Phases
  20-26) to justify shifting toward product completion instead.

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

**No financial OWNER DECISION REQUIRED items are open.** Nothing in
Phases 5-8 required inventing a financial value; every configurable
field defaults to null/0/fail-open until the owner sets it via the
admin console.

## OWNER DECISION REQUIRED — Open (Phase 8)

**Sentry activation.** The full integration architecture is built
(`src/instrumentation.ts`, `src/instrumentation-client.ts`,
`src/sentry.server.config.ts`, `src/sentry.edge.config.ts`) and every
`Sentry.init()` call is explicitly guarded — it performs **zero network
activity today**. To activate real error tracking/reporting, the owner
needs to:

1. Create a Sentry project (sentry.io or self-hosted) — an account/billing
   decision, not an engineering one.
2. Set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` (see `.env.example`) to
   that project's DSN — typically the same value in both.

No code change is needed once those are set — every mechanism described
in `docs/OBSERVABILITY.md` starts reporting immediately. This is not a
blocker to anything else: every other observability feature (structured
request logging, request-id correlation, safe error responses, job
lifecycle logging, frontend/server error boundaries) is fully functional
right now, independent of Sentry.

## OWNER DECISION REQUIRED — Open (Phase 19)

**Mandatory pre-publish moderation — whether to actually turn it on.**
The technical capability now exists
(`PlatformSettings.requirePrePublishReview`, toggled via a checkbox at
`/admin/settings`), built specifically so this decision could be made
later without any further engineering work. The owner was asked
directly this session and confirmed: build the capability, do not flip
the default. The toggle stays `false` — new listings continue
publishing straight to `ACTIVE` — until the owner explicitly decides to
enable it. This is a genuine product/velocity trade-off (core
marketplace loop vs. trust posture), not a technical call: enabling it
means every seller's new listing waits for a moderator before going
live, which has real UX and moderation-workload implications the owner
should weigh, not something to default silently.

## Blockers

None.

## Exact Next Action

Phases 20 through 28 are all committed and pushed (both branches kept
in sync — see Git Safety in `CLAUDE.md` and this session's owner
authorization to merge into `main`). Phase 25 closed Phase 24's one
remaining cosmetic finding (`getUserDetail()`'s over-fetch). Phase 26
completed the financial/business-logic integrity audit an earlier
session had started but never finished, finding and fixing one real
gap (the Paymob webhook's amount/currency cross-check). Phase 27 built
the missing `/favorites` page. Phase 28 closed the thin-metadata
audit-log gap this section used to list as the leading remaining
candidate — it is no longer open. This session ran eleven fresh audits
total, per the owner's explicit continuation
directive to keep re-auditing and implementing every owner-independent
technical gap found rather than stopping at the first "nothing left"
conclusion: IDOR/authorization, rate limiting, DB indexes,
background-job idempotency, Paymob webhook duplicate-processing,
notification-delivery reliability, session/cookie security, N+1 query
patterns, admin-audit-log completeness, CSRF coverage completeness,
frontend authorization-assumption leaks, and financial/business-logic
integrity. Seven came back fully clean (IDOR/authorization;
background-job idempotency; Paymob webhook duplicate-processing;
session/cookie security; N+1 query patterns; CSRF coverage; frontend
authorization leaks). The financial-integrity audit (Phase 26) was
five-sevenths clean (order state machine, ledger, subscriptions,
shipping commission, hardcoded-value scan) with one real gap found and
fixed, plus one confirmed-not-a-bug finding (refund/return handling is
genuinely unbuilt, an open owner decision, not a technical gap). The
other three purely-technical audits each found real, genuine gaps, all
now fixed and closed (Phase 20: DB indexes; Phase 21: rate limiting +
verification-request dedupe; Phase 22: Paymob HMAC timing safety, an
image-processing sweep-race guard, and notification DB-write
isolation; Phase 23: Listing-keyed audit trail for report-driven
removal/flagging, plus `setUserStatus`'s `{from, to}` metadata).

**Phases 24 and 26 both being mostly/fully clean is the strongest
signal yet** that the highest-value, most obviously-exploitable
technical gaps identified by security- and integrity-shaped audits
(auth, IDOR, CSRF, session/cookie handling, rate limiting, race
conditions, audit-trail completeness, N+1 performance, frontend data
leaks, and now core financial logic) are largely closed as of this
session. This is not proof nothing remains (the project's own history
says a "nothing left" conclusion has been wrong before), but a future
session should treat this as a genuine inflection point: still run a
fresh audit at the start (per CLAUDE.md Section 1), but seriously
weigh whether the next unit of work is a **product feature** (the
Deferred items below are almost all owner-gated or scope-larger-than-
a-single-pass, not "undiscovered security/integrity bugs") rather than
another audit angle.

Remaining candidates for a future purely-technical audit round, not yet
exhaustively checked: a general re-scan of `src/app/api/**` for any
route added in a recent phase that might have skipped `withApiHandler`
or rate limiting by oversight (no such gap is currently known — this is
a "check anyway" item, not a known lead). The thin-metadata audit-log
gap and `getUserDetail()`'s over-fetch (both previously listed here) are
now closed — Phase 25 and Phase 28 respectively.

**Important precedent, now confirmed across ten phases**: Phase 15
found a real double-sell race a prior audit had missed; Phase 16
re-audited and found four more genuine gaps; Phase 17 closed the one
remaining genuinely-technical Deferred item from that audit
(pagination); Phase 18's own re-audit of Phase 17's "these three were
the only holdouts" conclusion found two more; Phase 19 closed the
scaffolding half of the one remaining product-decision item; Phase 20's
own re-audit of "nothing technical left" found twelve missing composite
indexes; Phase 21 closed the rate-limiting gap the same audit round
found; Phase 22's further audit round found three more real gaps
(timing-safe HMAC, a job-race guard, notification-failure isolation)
even after two of three prior audit rounds had already come back clean;
Phase 23's further audit round found one more real gap (a missing
Listing-keyed audit trail) even after two of that round's three audits
had already come back clean; **Phase 24's round, for the first time
this session, found nothing beyond a cosmetic nit** across two
exhaustive (not spot-checked) audits. Every future session must still
open with a fresh audit rather than assuming the roadmap below is
complete, but should weigh that against Phase 24's signal that the
easily-discoverable technical-security surface may now be largely
covered, and consider whether the owner has a product-direction
preference before defaulting to "audit again."

**SMS gateway, Email gateway, Sentry**: all three already have complete,
tested technical scaffolding (Phases 8, 11, 14) — a vendor-agnostic HTTP
provider abstraction for SMS/email, a fully guarded Sentry
instrumentation setup — inert by design until the owner supplies real
credentials via env vars. There is no further scaffolding to build; the
only remaining step is the owner setting real values for
`SMS_PROVIDER_API_URL`/`KEY`, `EMAIL_PROVIDER_API_URL`/`KEY`,
`SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` — values this codebase must never
invent (CLAUDE.md Section 6/14).

**Paymob sandbox verification**: cannot be performed without real Paymob
merchant credentials, which don't exist in this environment. The
integration is code-complete (built to Paymob's documented Accept API v1
shape) but literally unverifiable without those credentials — nothing to
build, only something to wait on.

Remaining candidates, all genuinely owner-gated (credentials or a
product decision), not purely-technical-and-unstarted:

- **The systemic `toFixed(2)` money-rounding note** (see Known Issues →
  Deferred, `src/modules/shipping/commission.ts`) — pre-existing
  everywhere in the codebase, not a newly-introduced bug; revisit only
  if real settlement data ever shows a discrepancy, not proactively.
- **SMS/Email/Sentry gateway activation** and **`withSentryConfig` +
  source-map upload** — see above; purely owner actions (real
  credentials, a Sentry project, `SENTRY_ORG`/`SENTRY_PROJECT`/
  `SENTRY_AUTH_TOKEN`).
- **Mandatory pre-publish moderation — turning it on** — see "OWNER
  DECISION REQUIRED — Open (Phase 19)" above. The scaffolding is done;
  only the decision to enable it remains, and it's the owner's alone.
- **Verifying the Paymob integration against a real sandbox** — see
  above; needs owner-supplied credentials.

A future session should re-run its own OODA audit (CLAUDE.md Section 4)
from a fresh angle rather than just re-scan this list — three phases in
a row are direct proof that doing so finds real things. Read this file +
`docs/*` fresh at the start of that session and confirm current git
state matches this document before writing any code.
