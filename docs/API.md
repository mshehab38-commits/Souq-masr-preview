# API

All routes are Next.js Route Handlers under `src/app/api/`. Conventions
that apply across every endpoint below unless noted otherwise:

- **Auth**: session identified via the `sm_session` httpOnly cookie
  (`SESSION_COOKIE_NAME`). Routes that require a logged-in user call
  `getCurrentUser()` and return `401` if there isn't one.
- **CSRF**: any mutating route (`POST`/`PATCH`/`DELETE`) that relies on
  the session cookie also requires an `x-csrf-token` header matching the
  `sm_csrf` cookie (double-submit pattern) — checked via `assertCsrf(request)`.
  Read-only `GET` routes don't require it.
- **Validation**: request bodies are parsed with Zod schemas defined in
  the route file; a failing parse returns `400` with the validation
  issues.
- **Errors**: JSON body `{ error: string }` (plus a machine-readable
  `reason` field on auth endpoints where the client needs to distinguish
  failure modes, e.g. OTP `expired` vs `incorrect_code`).

## Auth (Phase 2)

### `POST /api/auth/otp/request`

Request an OTP code for a phone number. Body: `{ phone: string }` (any
format `normalizeEgyptianPhone` accepts — local `01...` or E.164).

Rate-limited: 60s cooldown per phone, max 5 requests per phone / 15
requests per IP per 15-minute window. Returns `429` with `reason` on
exceeding a limit.

Response: `{ ok: true, devCode?: string }` — `devCode` is only present
when `NODE_ENV !== "production"`, so the full auth flow is testable
without a real SMS provider.

### `POST /api/auth/otp/verify`

Verify a code and establish a session. Body:
`{ phone: string, code: string }`.

On success: sets the `sm_session` (httpOnly) and `sm_csrf` cookies,
returns `{ ok: true }`. Creates the `User` row on first successful
verification for a new phone (OTP verification doubles as registration).

Failure `reason`s: `invalid_phone`, `no_active_code`, `expired`,
`incorrect_code`, `too_many_attempts`.

### `POST /api/auth/logout`

Requires session + CSRF. Revokes the current session server-side (not
just clearing the cookie) and clears both cookies.

## Profile (Phase 2)

### `GET /api/profile`

Requires session. Returns the current user's profile fields, including
`email: string | null` (Phase 14).

### `PATCH /api/profile`

Requires session + CSRF. Body: `name` (required), `email` (optional —
omit to leave unchanged, empty string `""` to clear, otherwise validated
via `normalizeEmail`; `400 invalid_email` on failure). `email` is a
delivery address for notifications only, never a login credential — see
`docs/DECISIONS.md`.

## Verification Requests (Phase 2)

### `GET /api/verification-requests`

Requires session. Returns the current user's own verification request
history.

### `POST /api/verification-requests`

Requires session + CSRF. Body: `{ type: "INDIVIDUAL_SELLER" |
"BUSINESS", businessName?: string, documentUrl?: string, notes?: string }`.
Creates a `PENDING` request; admin review UI lands in Phase 10.

## Listings (Phase 3)

### `POST /api/listings`

Requires session + CSRF. Body: `{ title, description?, price?,
negotiable?, categoryId, governorateId?, cityId?, attributes: Record<string, unknown> }`.

`attributes` is validated server-side against that category's
`CategoryAttribute` rows (`validateListingAttributes`) — an unknown key,
a missing required field, or a wrong type/option returns `400`.
Commerce eligibility (`commerceEnabled`/`fulfillmentMode`) is resolved
server-side from the category default and the seller's verification
status, never taken from the request body. Enqueues a search-indexing
job. Returns the created listing.

### `GET /api/listings/[id]`

Public. Returns the listing plus its images (only `READY` ones) if
`status` is `ACTIVE`/`SOLD`/`EXPIRED`, or any status if the requester is
the listing's owner or a MODERATOR/ADMIN (Phase 10 — previously this had
no visibility check at all, so a `DRAFT` listing's ID was fetchable by
anyone; see `docs/DECISIONS.md`). `404` otherwise. Increments `viewCount`
on non-owner views.

### `PATCH /api/listings/[id]`

Requires session + CSRF + ownership. Same body shape/validation as
`POST`. Re-enqueues search indexing.

### `DELETE /api/listings/[id]`

Requires session + CSRF + ownership. Soft-deletes (`deletedAt`), not a
hard delete.

### `POST /api/listings/[id]/sold`

Requires session + CSRF + ownership. Marks the listing `SOLD`.

### `GET /api/listings/mine`

Requires session. Returns the current user's own listings (all
statuses, including `DRAFT`/`SOLD`/`EXPIRED`).

### `POST /api/listings/[id]/favorite`

Requires session + CSRF. Toggles a `Favorite` row for the current user
on this listing. Returns the new favorited state.

## Listing Bulk & Renewal (Phase 4)

### `POST /api/listings/bulk`

Requires session + CSRF. Body: `{ listingIds: string[] (max 100), action:
"mark_sold" | "delete" | "relist" }`. Every action is scoped to the
caller's own listings in the query's `WHERE` clause itself — an ID for a
listing the caller doesn't own is silently excluded from `affected`
rather than causing an error. `relist` only affects listings currently
`SOLD` or `EXPIRED`, flipping them to `ACTIVE` with a fresh `expiresAt`.
Returns `{ requested, affected }`.

### `POST /api/listings/[id]/renew`

Requires session + CSRF + ownership. Resets `expiresAt` to a fresh
60-day window and ensures status is `ACTIVE`. Only works on listings
currently `ACTIVE` or `EXPIRED` — a `SOLD` listing must be revived via
the `relist` bulk action instead, not renewed.

## Listing Images (Phase 3)

### `POST /api/listings/[id]/images/upload-url`

Requires session + CSRF + ownership. Body: `{ contentType: string }`
(must be `image/jpeg`, `image/png`, or `image/webp` — checked against an
allow-list before a target is even issued). Returns a presigned upload
target: `{ uploadUrl, headers, key }` (R2) or a same-origin local URL +
key (dev only).

### `POST /api/listings/[id]/images/confirm`

Requires session + CSRF + ownership. Body: `{ key: string }` — the key
returned by `upload-url`, after the client has `PUT`ed the file there.
Creates a `PENDING` `ListingImage` row and enqueues the image-processing
job (magic-byte validation, EXIF/GPS strip, WebP variant generation).
Returns `201` with the created row.

### `DELETE /api/listings/[id]/images/[imageId]`

Requires session + CSRF + ownership. Deletes the `ListingImage` row and
its underlying storage objects.

## Favorites (Phase 3)

### `GET /api/favorites`

Requires session. Returns the current user's favorited listings.

## Stores (Phase 4)

### `POST /api/stores`

Requires session + CSRF. Body: `{ name: string, description?: string }`.
Creates the caller's storefront — one per user (`already_exists` on a
second attempt). Generates a globally unique `slug` server-side; the
client never supplies one. Returns `{ success, storeId, slug }`.

### `GET /api/stores/mine`

Requires session. Returns `{ store: Store | null }` for the caller's own
storefront (or `null` if they haven't created one).

### `PATCH /api/stores/mine`

Requires session + CSRF. Body: `{ name?: string, description?: string }`.
Updates the caller's own storefront. `404` if they don't have one yet.

### `POST /api/stores/mine/branding?kind=logo|cover`

Requires session + CSRF. Body is the raw image bytes (not JSON) with
`Content-Type` set to `image/jpeg`, `image/png`, or `image/webp` — same
allow-list as listing images. Validated by magic bytes
(`detectImageMime`, reused from the listing-image pipeline), resized
synchronously (logo: 400×400 cover-fit; cover: 1600×500 cover-fit),
re-encoded to WebP, and stored via the same `StorageProvider` as listing
photos. Unlike listing images this is **not** queued through BullMQ —
branding images are small and low-volume enough that the settings page
can wait for the result inline. Returns `{ success, url }`.

### `GET /api/stores/[slug]`

Public. Returns `{ store, listings }` where `listings` is the store
owner's `ACTIVE` listings, paginated (`?page=`). `404` if the slug
doesn't resolve to a store.

## Search (Phase 3)

### `GET /api/search`

Public. Query params parsed by `resolveSearchFilters()` (shared with the
`PostgresSearchProvider` tests): `q` (free text), `categoryId`,
`governorateId`, `minPrice`, `maxPrice`, `commerceEnabled`, `page`,
`pageSize`. Returns `{ items, page, pageSize, total }` — page-based, not
cursor-based, pagination.

Free-text relevance uses `pg_trgm` `word_similarity()` against each
listing's precomputed `searchText`, with Arabic normalization applied to
the query the same way it was applied when `searchText` was built (hamza
unification, ة→ه, ى→ي, tashkeel stripping) — see
`src/modules/catalog/search-text.ts`.

## Saved Searches (Phase 12)

### `GET /api/saved-searches`

Any authenticated user. Returns `{ items }` — the caller's own saved
searches, newest first.

### `POST /api/saved-searches`

Any authenticated user. Body: `{ name, query }` where `query` is the same
raw shape `GET /api/search` accepts (`q`, `category`, `governorate`,
`city`, `minPrice`, `maxPrice`, `sort` — slugs, not resolved IDs). Returns
`409 { error: "limit_reached" }` past 20 saved searches for that user, or
`201 { success: true, id }`.

### `DELETE /api/saved-searches/[id]`

Any authenticated user, ownership-scoped (a saved search belonging to
another user returns `404`, not `403` — no confirmation that the id
exists at all). Returns `{ ok: true }`.

New listings are matched against every saved search's `query` right after
search indexing (`src/jobs/search-indexing.ts` → `notifyMatchingSavedSearches`),
creating a `SAVED_SEARCH_MATCH` notification (in-app + SMS, per the
general notification pipeline) for each matching user — see
`docs/DECISIONS.md` for how matching works and its known limitations.

## Local Upload Serving (Phase 3, dev/test only)

### `PUT /api/uploads/local/[...path]` / `GET /api/uploads/local/[...path]`

Backs `LocalStorageProvider` so the full upload flow works without real
object-storage credentials in dev/CI. Both handlers call
`resolveSafePath()` to reject any path that would escape
`.local-storage/` (path traversal guard), and both return `404`
unconditionally when `NODE_ENV === "production"` — this route can never
serve or accept traffic in production regardless of how storage env vars
are (mis)configured.

## Orders & Checkout (Phase 5)

### `POST /api/orders`

Requires session + CSRF. Body: `{ listingId, paymentMethod?, shippingCompanyId?, shippingAddress?, buyerNote? }`.
Checks out a commerce-enabled `ACTIVE` listing. Rejects with a specific
error for every invalid state: `listing_not_found`,
`not_checkout_enabled`, `cannot_buy_own_listing`, `price_not_set`,
`payment_method_unavailable` (`ONLINE` requested but no live gateway is
configured), `shipping_company_required` (a `PLATFORM_SHIPPING` listing
with no company chosen), `shipping_rate_unavailable` (the chosen company
has no rate for the buyer's governorate and no default fee). On success,
snapshots `productPrice`/`shippingFee`/`shippingCommissionAmount` from
whatever's in effect right now, reserves the listing (`SOLD`), and
returns `{ success, orderId, redirectUrl? }` — `redirectUrl` is only
present for a (currently unreachable, since `ONLINE` requires live
credentials) online-payment checkout.

### `GET /api/orders/[id]`

Requires session. Returns the order if the caller is its buyer, seller,
or an admin; `403` otherwise.

### `GET /api/orders/buying` / `GET /api/orders/selling`

Requires session. Lists the caller's own orders as a buyer or as a
seller, respectively.

### `POST /api/orders/[id]/transition`

Requires session + CSRF. Body: `{ targetStatus, cancelReason? }`. Moves
an order through the state machine
(`src/modules/orders/state-machine.ts`): `PENDING → CONFIRMED →
PREPARING → READY_FOR_PICKUP → PICKED_UP → IN_TRANSIT →
OUT_FOR_DELIVERY → DELIVERED → COMPLETED`, plus
`CANCELLED`/`FAILED`/`RETURNED`/`REFUNDED`/`DISPUTED`. The caller's role
(buyer/seller/admin, resolved from the order's own `buyerId`/`sellerId`)
gates which transitions are allowed; an admin can additionally override
any transition that exists in the table for *some* actor, as a support/
dispute-resolution capability — never one that doesn't exist at all.
Cancelling releases the listing reservation back to `ACTIVE` with a fresh
expiry. Reaching `COMPLETED` on an `ONLINE`-paid order creates a
`SellerPayout` for the full `productPrice` and a matching `LedgerEntry`
(account `SELLER_PAYABLE`) — zero commission deducted; a
`CASH_ON_DELIVERY` order creates neither, since the platform never held
that money.

## Shipping Options (Phase 5)

### `GET /api/shipping-options?governorateId=`

Public. Returns every active shipping company with a resolvable fee for
the given governorate (a company-specific `ShippingRate`, or its
`defaultFlatFee` fallback) — exactly what the checkout page offers the
buyer as `PLATFORM_SHIPPING` options.

## Payment Webhooks (Phase 5, inert until configured)

### `POST /api/webhooks/paymob`

Returns `503` unless `PAYMOB_API_KEY`/`PAYMOB_INTEGRATION_ID`/
`PAYMOB_IFRAME_ID`/`PAYMOB_HMAC_SECRET` are all set. Once configured,
verifies the webhook's HMAC signature before updating the linked order's
`paymentStatus` to `CAPTURED`/`FAILED`. Exists now so the route can be
registered as Paymob's callback URL the moment real credentials are
supplied, without a code change then.

## Admin: Platform Settings (Phase 5)

### `GET /api/admin/settings` / `PATCH /api/admin/settings`

Admin-only (`requireAdmin()` — `403` otherwise). Reads/updates the
`PlatformSettings` singleton: `freeListingActiveLimit`,
`paymentProcessingFeeBearer`. Both nullable; `PATCH` accepts `null`
explicitly to clear a previously-set value back to "not configured."

## Admin: Subscription Plans (Phase 5)

### `GET /api/admin/plans` / `POST /api/admin/plans`

Admin-only. Lists all plans (including inactive) / creates a new plan.
`monthlyPrice`/`yearlyPrice` default to unset — a plan is not
purchasable until the owner sets a real price.

### `PATCH /api/admin/plans/[id]` / `DELETE /api/admin/plans/[id]`

Admin-only. Updates a plan's fields, or soft-deletes it (also
deactivates it).

### `POST /api/admin/subscriptions`

Admin-only. Body: `{ userPhone, planId, billingCycle }`. Grants a
subscription directly (the interim mechanism until self-serve online
purchase exists — see `docs/DECISIONS.md`). Fails with `plan_not_priced`
if the plan has no price set for the requested cycle, or
`plan_not_found`/`user_not_found`. On success, records a
`SUBSCRIPTION_REVENUE` `LedgerEntry` for the plan's price.

### `DELETE /api/admin/subscriptions/[id]`

Admin-only. Revokes (cancels) an active subscription.

## Admin: Shipping (Phase 5)

### `GET /api/admin/shipping-companies` / `POST /api/admin/shipping-companies`

Admin-only. Lists all companies (including inactive) / creates a new one.

### `GET /api/admin/shipping-companies/[id]` / `PATCH .../[id]` / `DELETE .../[id]`

Admin-only. Fetch/update (including `defaultFlatFee`)/soft-delete a
company.

### `GET /api/admin/shipping-companies/[id]/rates` / `POST .../rates`

Admin-only. Lists a company's per-governorate rates / upserts one
(`{ governorateId, flatFee }`, both required — see `docs/DATABASE.md`
for why the company-wide fallback is a separate field, not a nullable
row here).

### `GET /api/admin/shipping-companies/[id]/commission` / `PATCH .../commission`

Admin-only. Reads/sets a company's `commissionPercent` (nullable — 0%
platform revenue until set).

### `GET /api/admin/shipping-companies/[id]/settlements` / `POST .../settlements`

Admin-only. Lists a company's settlements / computes a new one for
`{ periodStart, periodEnd }` — sums the company's `COMPLETED` orders in
that range and posts a `SHIPPING_COMMISSION_REVENUE` ledger entry for
the commission only.

## Admin: Ledger (Phase 5)

### `GET /api/admin/ledger`

Admin-only. Returns `{ summary, recentEntries }` — total platform revenue
broken down by type (subscriptions / shipping commission / promoted
listings, never product-sale proceeds), plus the 50 most recent ledger
rows for a raw audit view.

## Reports (Phase 6)

### `POST /api/reports`

Any authenticated user. Body is a discriminated union on `targetType`:
`{ targetType: "LISTING", listingId, reason, details? }` or
`{ targetType: "USER", targetUserId, reason, details? }`. `reason` is one
of `SPAM`/`PROHIBITED_ITEM`/`FRAUD_SCAM`/`MISLEADING`/
`OFFENSIVE_CONTENT`/`DUPLICATE`/`OTHER`. Returns `404 target_not_found`
for a nonexistent/deleted target, `400 cannot_report_self` for a
self-targeted user report, `429 rate_limited` if this reporter has
already filed 20 new reports in the past hour (Phase 9 — a deduped
`alreadyOpen` report never counts toward this limit), or
`201 { report, alreadyOpen }` — `alreadyOpen: true` means an existing
`OPEN` report by this reporter against this target was returned instead
of creating a duplicate.

## Admin: Users (Phase 6)

### `GET /api/admin/users`

MODERATOR or ADMIN. Query params: `query` (matches phone or name),
`status`, `role`, `page`. Returns the same `{ items, page, totalPages,
totalCount }` shape used by search/ledger listings.

### `GET /api/admin/users/[id]`

MODERATOR or ADMIN. Returns `{ user, listingCount, buyerOrderCount,
sellerOrderCount, reportsMadeCount, reportsReceivedCount }`.

### `PATCH /api/admin/users/[id]`

**ADMIN-only** (stricter than the `GET` above — see
`docs/DECISIONS.md`). Body: `{ status? }` and/or `{ role? }` (at least
one required). Setting `status` to `SUSPENDED`/`BANNED` also revokes
every active session for that user. Setting `role` away from `ADMIN`
fails with `409 { error: "last_admin" }` if it would leave the platform
with zero admins.

## Admin: Reports (Phase 6)

### `GET /api/admin/reports`

MODERATOR or ADMIN. Query params: `status` (default `OPEN`),
`targetType`, `page`.

### `PATCH /api/admin/reports/[id]`

MODERATOR or ADMIN for `{ decision: "DISMISS" }`,
`{ decision: "ACTION_TAKEN", action: "REMOVE_LISTING" }`, or
`{ decision: "ACTION_TAKEN", action: "FLAG_FOR_REVIEW" }` (Phase 10 — moves
the listing to `PENDING_REVIEW` instead of removing it; see
`GET`/`PATCH /api/admin/listings/pending-review` below).
**ADMIN-only** for `{ decision: "ACTION_TAKEN", action: "SUSPEND_USER" }`
— checked in the route handler before calling the module, on top of the
`requireModerator()` gate every other case uses. Fails `409
already_resolved` if the report isn't `OPEN`, or `409 action_failed` if
the underlying listing/user action didn't succeed (report stays `OPEN`
for retry rather than being silently closed).

## Admin: Pending-Review Listings (Phase 10)

### `GET /api/admin/listings/pending-review`

MODERATOR or ADMIN. Query params: `page`. Returns
`{ items, page, totalPages, totalCount }` — the moderation queue of
listings currently `PENDING_REVIEW` (reached only via the `FLAG_FOR_REVIEW`
report action above), ordered oldest-flagged-first.

### `PATCH /api/admin/listings/pending-review/[id]`

MODERATOR or ADMIN. Body: `{ decision: "APPROVE" | "REJECT" }`. `APPROVE`
returns the listing to `ACTIVE`; `REJECT` sets it to `REJECTED`. Either
way the seller is notified (`LISTING_REVIEW_DECIDED`). Returns
`404 not_found` if the listing isn't currently `PENDING_REVIEW`.

## Admin: Verification Requests (Phase 6)

### `GET /api/admin/verification-requests`

MODERATOR or ADMIN. Query params: `status` (default `PENDING`), `page`.

### `PATCH /api/admin/verification-requests/[id]`

MODERATOR or ADMIN. Body: `{ decision: "APPROVED" | "REJECTED", notes? }`.
On `APPROVED`, sets `User.commerceVerifiedAt` and, only for a `BUSINESS`
request against a still-`INDIVIDUAL` user, promotes their role to
`BUSINESS`. Fails `409 already_reviewed` for a request that's already
been decided.

## Notifications (Phase 7)

### `GET /api/notifications`

Any authenticated user. Query params: `unreadOnly` (`"true"`/omit),
`page`. Returns `{ items, page, totalPages, totalCount, unreadCount }` —
`unreadCount` is always the caller's total unread count regardless of
the `unreadOnly`/pagination filters, so the UI can show a badge without
a second request.

### `PATCH /api/notifications/[id]`

Any authenticated user. Marks one of the caller's own notifications as
read (ownership scoped in the query itself — a 404 for someone else's
notification id, never a 403 that would confirm it exists).

### `POST /api/notifications/read-all`

Any authenticated user. Marks every unread notification belonging to
the caller as read. Returns `{ success: true, count }`.
