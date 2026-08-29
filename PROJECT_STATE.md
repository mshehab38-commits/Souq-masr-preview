# Souq Masr — Project State

> Source of truth for resuming work across sessions. Read this file (and
> `git log`) at the start of every session instead of relying on prior
> conversation memory. Read `CLAUDE.md` first for the permanent operating
> rules this file's history assumes, `docs/BUSINESS_MODEL.md` before
> touching any financial logic, and `docs/OWNER_WORK_METHOD.md` for how
> the owner expects tasks to be framed.

Last updated: 2026-08-29 (Phase 12 completion)

## Current Status

**Phase 12 (Saved-search alerts: full CRUD + a new-listing match-and-notify
pipeline for the `SavedSearch` model that had existed since Phase 3 with
zero implementation, plus a real deploy-blocking migration-ordering bug
found and fixed) is COMPLETE, validated, committed, and pushed.**

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
| 7 | Notifications: in-app notification bell, order/report/verification trigger wiring | `163b5f4` | Done |
| 8 | Observability: request-id + lifecycle logging (all API routes), safe-logging audit/fix, job lifecycle logging, error boundaries, Sentry architecture | `28bd03f` | Done |
| 9 | Launch readiness: responsive mobile navigation, notification-dropdown overflow fix, report rate limiting | `286299a` | Done |
| 10 | Proactive moderation: flag-for-review escalation, pending-review admin queue, listing visibility gating fix | `e36dad3` | Done |
| 11 | SMS notification delivery: general-purpose `SmsProvider`, vendor-agnostic real gateway, SMS mirror on every notification | `d9ee7df` | Done |
| 12 | Saved-search alerts: CRUD + match-and-notify pipeline, migration-ordering bug fix | this session | **Done** |
| 13 | Remaining roadmap items (see Deferred below) | — | Not started |

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

- 14 migrations applied — this phase added
  `20260829084100_add_saved_search_match_notification_type`
  (`NotificationType` gains `SAVED_SEARCH_MATCH`; `SavedSearch` itself
  needed no schema change, it already existed since Phase 3). Also: the
  Phase 10 migration was renamed from `20260829074331_...` to
  `20260829140000_...` to fix a real ordering bug — see "Bug Found and
  Fixed in Phase 12" above; the row count of 14 (not 15) reflects that
  this was a rename, not an addition. Schema at `prisma/schema.prisma`.
  See `docs/DATABASE.md` for full entity documentation and the migration-
  ordering rule this established.

## Tests & Results (Phase 12, all green)

- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run boundaries` — no violations (219 modules, 774 dependencies).
- `npm test` — **275/275 unit tests passing** across 34 files. New this
  phase: `tests/search/saved-searches.test.ts` (11 tests — CRUD, the
  per-user cap, the `matchesListing` predicate across all filter types,
  and `notifyMatchingSavedSearches`'s dedup-per-user behavior), plus
  `tests/jobs/search-indexing.test.ts` (1 test — confirms indexing runs
  before the match check, not just that both ran).
- `npx playwright test` — **8/8 e2e specs passing**. New this phase:
  `e2e/saved-search-flow.spec.ts` (save a search from `/search`, confirm
  it's listed on `/saved-searches`, delete it). All 7 pre-existing specs
  pass unmodified. (Two runs during this phase's validation hit
  environment-only flakiness — accumulated OTP rate-limit keys from
  repeated debug runs, and this sandbox's variable cold-`next dev`-compile
  timing on whichever admin route a given run happened to hit first —
  both confirmed non-issues by clearing Redis keys and re-running clean;
  not a code regression.)
- `npm run build` — clean, warning-free production build, 3 new routes
  (`/saved-searches` page + its two API routes).

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
  the `withApiHandler` generic-default issue from Phase 8, and the
  `getListingById` visibility gap from Phase 10 were all found and fixed
  within their own development pass, never shipped.)

### Deferred (not bugs — explicit scope decisions)

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

- **Saved-search matching can send a repeat notification when a listing
  is edited** — `notifyMatchingSavedSearches` runs from the
  `search-indexing` job, which also re-fires whenever a listing's title/
  description is updated, with no `(user, listing)` dedup tracking a
  user was already notified. Proportionate for this phase's launch
  scope (matches don't self-trigger without a new listing or a real
  content edit); add a dedup table if it becomes a real complaint.

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
- **New listings still publish straight to `ACTIVE`; there is no
  mandatory pre-publish review gate** — Phase 10 gave moderators a
  reversible `PENDING_REVIEW` escalation (`FLAG_FOR_REVIEW`, off a
  report) as a genuine third option alongside dismiss/remove, so
  `ListingStatus.PENDING_REVIEW`/`REJECTED` are no longer unused — but
  this stays report-driven, not gate-on-every-listing. Deliberately not
  built as a mandatory gate: forcing every new listing through moderator
  approval before it's visible is a real product/velocity trade-off (core
  marketplace loop vs. trust posture), not a pure technical call — flag as
  **OWNER DECISION REQUIRED** if the owner wants that stronger posture.
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

## Blockers

None.

## Exact Next Action

Phase 12 is committed and pushed. Per the standing execution rule (one
phase at a time, validate, stop for approval), **this session stops
here**, awaiting direction on what to build next. Candidates, in rough
priority order given what's genuinely missing today:

- **SMS gateway activation** — purely an owner action now (pick a
  gateway, set `SMS_PROVIDER_API_URL`/`SMS_PROVIDER_API_KEY`, optionally
  a thin adapter if the chosen gateway's API doesn't already match the
  `{ to, message }` + bearer-token contract), not engineering work; see
  `docs/DECISIONS.md`. Every other notification path already works fully
  regardless (in-app always; SMS best-effort once configured).
- **Email notification delivery** — still not built; no provider
  decision made, and would need a new `User.email` field (this app is
  phone-first, no email field exists on `User` today) — a genuinely
  larger unit of work than the SMS extension was.
- **Sentry activation** — purely an owner action (create a project, set
  two env vars); see "OWNER DECISION REQUIRED — Open" above. Still open,
  unchanged since Phase 8.
- **`withSentryConfig` + source-map upload** — needs
  `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`, separate from the
  DSN; a follow-up once Sentry itself is activated.
- **Mandatory pre-publish moderation** (every new listing held for
  approval before going `ACTIVE`, vs. today's report-driven
  `FLAG_FOR_REVIEW`) — a genuine product/velocity trade-off, flagged as a
  possible **OWNER DECISION REQUIRED** in Known Issues; not started.
- **Saved-search notification dedup** — a `(user, listing)` tracking
  table to stop a listing edit from re-notifying a user already told
  about it; a real but low-urgency gap, see Known Issues.
- A Deferred item from Phase 5 (wiring real Paymob credentials once the
  owner has them, verifying the integration against Paymob's live
  sandbox).

Read this file + `docs/*` fresh at the start of that session and confirm
current git state matches this document before writing any code.
