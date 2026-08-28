# Database

PostgreSQL 16, accessed via Prisma 6. Schema source of truth:
`prisma/schema.prisma`. This document explains the *why* behind the
schema; for the literal field list, read the schema file directly — it's
kept short enough (324 lines as of Phase 3) to read in full.

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
  and a GIN `pg_trgm` index on `searchText` for fuzzy search.
- **`ListingImage`** — one row per uploaded image. Created in `PENDING`
  status pointing at the just-uploaded `originalKey`; the image-processing
  worker fills in `thumbnailUrl`/`mediumUrl`/`fullUrl` and flips status to
  `READY` (or `REJECTED` on invalid/corrupt input) asynchronously.
- **`Favorite`** — unique on `(userId, listingId)`.
- **`SavedSearch`** — `query` is a `Json` blob of the search filters as
  the user last configured them; no notification/alert delivery yet
  (future phase).

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
