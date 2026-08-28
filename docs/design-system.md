# Souq Masr Design System

Phase 1B foundation for every later screen. Nothing here is category- or feature-specific — that logic lives in the modules that use these primitives.

## Brand

- **Name:** سوق مصر (Souq Masr)
- **Logo:** `src/components/brand/Logo.tsx` — a geometric shopping-bag mark in a rounded teal badge with an amber accent stripe, paired with the Arabic wordmark in Cairo Bold. Use `<Logo variant="mark" />` for compact/icon-only placements (e.g. mobile nav), `<Logo />` (full) elsewhere.
- **Favicon / app icon:** generated at request time by Next.js's `app/icon.tsx` (32×32) and `app/apple-icon.tsx` (180×180) via `next/og`'s `ImageResponse` — a simplified monogram (the Arabic letter س on a teal square), since the detailed bag mark doesn't stay legible at favicon size. No static image assets or extra image-processing dependency needed; Next.js wires the `<link>` tags automatically.

## Color Palette

Deliberately distinct from regional competitors (Haraj green, OLX blue/green, Noon yellow, Souq.com orange).

| Token | Hex | Use |
|---|---|---|
| `teal-600` | `#0F8A82` | Primary brand color — buttons, links, active states |
| `teal-50`…`teal-950` | — | Full scale for backgrounds, borders, hover/active states |
| `amber-500` | `#E8940A` | Accent — CTAs that need to stand out from primary actions, promotional/featured indicators |
| `amber-50`…`amber-900` | — | Full accent scale |
| `success` | `#16A34A` | Positive status (e.g. verified, delivered) |
| `warning` | `#CA8A04` | Caution status — intentionally a different hue from the amber accent so "warning" is never confused with "promoted" |
| `danger` | `#DC2626` | Errors, destructive actions |
| `info` | `#2563EB` | Informational states |

All tokens are defined in `tailwind.config.ts` under `theme.extend.colors`. Never hardcode a hex value in a component — use the Tailwind class (`bg-teal-600`, `text-danger`, etc.).

## Typography

- **Cairo** (`font-cairo`, weights 500/700/800) — headings, prices, brand wordmark.
- **Tajawal** (`font-tajawal`, weights 400/500/700) — body text (set as the default body font in `layout.tsx`).
- Both are self-hosted via `next/font/google` with `arabic` + `latin` subsets — no external font CDN, no layout shift.

## Component Inventory (`src/components/ui`)

| Component | Purpose |
|---|---|
| `Button` | 5 variants (primary/accent/outline/ghost/danger), 3 sizes, loading state |
| `Input` | Labeled text input with error/hint messaging, RTL-safe |
| `Card` | Base container for grids, listing/product cards build on this |
| `Badge`, `VerifiedBadge` | Status pills (tone-based) and a dedicated seller-verification indicator |
| `Rating` | Half-star-accurate rating display with count |
| `PriceTag` | EGP-formatted price (`ar-EG` locale, Latin digits, grouped) with an optional negotiable label |
| `ImageGallery` | Main image + thumbnail strip, client-side active-image state |
| `FilterSelect`, `FilterPanel` | Presentational filter controls — wiring to real search/filter state happens per-feature |
| `Pagination` | Numbered pager with ellipsis collapsing, hides itself at 1 page |
| `Modal` | Accessible dialog (Escape-to-close, backdrop click, `role="dialog"`) |
| `EmptyState`, `ErrorState`, `LoadingState` | The three states every data-driven page needs |

Every primitive is presentational: it takes data and callbacks as props and never reaches into a module's service layer directly. Feature code composes these; these never assume a specific feature.

## Conventions

- **RTL-first:** the document root is `<html lang="ar" dir="rtl">`; component layout relies on the browser's bidi handling plus standard flex/grid rather than hardcoded `ml-`/`mr-` utilities. English-locale support later needs no component rewrites — only content/locale switching.
- **Soft deletes:** every mutable table (`users`, `categories`, `category_attributes`, `listings` as of Phase 1B) carries a `deletedAt DateTime?` column; all reads must filter `deletedAt: null` explicitly (see `src/modules/catalog/service.ts` for the pattern). Static geographic reference data (`governorates`, `cities`) is intentionally excluded — it isn't user- or admin-mutable content.
- **No external UI kit:** primitives are hand-built on Tailwind utilities to keep bundle size and brand control tight, per the approved plan.
