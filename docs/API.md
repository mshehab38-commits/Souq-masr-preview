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

Requires session. Returns the current user's profile fields.

### `PATCH /api/profile`

Requires session + CSRF. Body: partial profile fields (currently `name`).

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
`status` is `ACTIVE`, or the full listing if the requester is the owner
(any status). Increments `viewCount` on non-owner views.

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

## Local Upload Serving (Phase 3, dev/test only)

### `PUT /api/uploads/local/[...path]` / `GET /api/uploads/local/[...path]`

Backs `LocalStorageProvider` so the full upload flow works without real
object-storage credentials in dev/CI. Both handlers call
`resolveSafePath()` to reject any path that would escape
`.local-storage/` (path traversal guard), and both return `404`
unconditionally when `NODE_ENV === "production"` — this route can never
serve or accept traffic in production regardless of how storage env vars
are (mis)configured.
