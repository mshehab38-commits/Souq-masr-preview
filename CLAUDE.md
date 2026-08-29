# CLAUDE.md — Permanent Operating Rules for Souq Masr

This file defines how every Claude Code session must operate on this
repository. It does not change per-session and is not conversation memory —
read it fresh every time, even (especially) if you believe you remember this
project from a prior turn.

Souq Masr is an existing, in-progress production project. It is never
rebuilt, never restarted, and never replaced from scratch.

## 1. Session Recovery (do this first, every session)

Before writing or changing any code:

1. Read this file (`CLAUDE.md`).
2. Read `PROJECT_STATE.md`.
3. Run `git status`.
4. Run `git branch --show-current` — the real branch is
   `claude/souq-masr-production-plan-g38qwv`. **`main` is not this
   project** — it holds only the original prototype upload
   (`tamam-standalone.html`) and has never received a merge. Do not treat
   `main`'s contents as the state of the project.
5. Run `git log --oneline -15`.
6. Skim the current implementation (`src/modules/*`, `prisma/schema.prisma`,
   `src/app/api/*`) rather than trusting a description of it.
7. Identify the latest completed phase from `PROJECT_STATE.md`'s Phase
   History table.
8. Identify the exact unfinished work from that file's "Exact Next Action"
   section.
9. Verify the previous session's claimed work actually exists in the repo
   (files present, tests present, migration applied) — do not assume a
   past summary was accurate.
10. Continue from that exact point. Never restart the project, redo a
    completed phase, or create a new branch/repo because a new session
    began.

If `PROJECT_STATE.md` and the actual repository disagree, the repository
wins. Update `PROJECT_STATE.md` to match reality, note the discrepancy, and
proceed.

## 2. Engineering Autonomy

Act as a professional senior software engineer with full technical
authority over implementation decisions. Do not ask the owner unnecessary
technical questions.

When a technical decision is required: evaluate the alternatives, choose
the technically appropriate one, implement it, and document the decision
in `docs/DECISIONS.md` when it's material (i.e. a future session would
otherwise wonder "why was it done this way").

Do not require owner approval for normal engineering choices (library
versions, internal module structure, test strategy, error handling,
schema shape for non-financial fields, etc.). Do require it for anything
covered by the Financial Boundary (Section 6) or a genuine product/business
decision (Section 7).

## 3. Architecture

**Style: modular monolith**, not microservices — one deployable Next.js
application. Business logic lives under `src/modules/<domain>/`, each
module exposing exactly one public surface (`service.ts`) with everything
else private to the module, enforced mechanically by `dependency-cruiser`
(`npm run boundaries`, wired into CI). See `docs/ARCHITECTURE.md` for the
full module list and rationale.

**Intended direction: frontend separated from backend through an API, with
the backend reusable by a future mobile app.** The current implementation
already satisfies this: every data mutation and query a mobile client would
need goes through `src/app/api/*` JSON route handlers backed by module
service functions — Server Components use module functions directly for
server-rendered pages, but no client-side interactive flow bypasses the API
layer to talk to Prisma directly. A future mobile app can consume the same
`/api/*` surface (documented in `docs/API.md`) without any backend rework.
This is not a gap to fix; it is the current state.

**Do not change this architectural direction** (e.g. splitting into a
separate backend service, switching to microservices, moving off Next.js
API routes) without first explaining, to the owner: technical impact, cost
impact, timeline impact, and migration/rework impact. If you find the
actual repository already differs from this description, inspect the real
implementation before changing anything — do not blindly rebuild it to
match this document.

## 4. OODA Work Method

Run every non-trivial task through:

- **OBSERVE** — inspect the repository, the existing implementation, and
  `PROJECT_STATE.md`. Never assume.
- **ORIENT** — understand the requirement, identify risks and dependencies,
  identify what's already built (Section 12: do not duplicate).
- **DECIDE** — make technical decisions autonomously (Section 2); flag
  genuine owner decisions separately and explicitly (Sections 6–7).
- **ACT** — implement, test, verify, fix.

Then repeat for the next unit of work.

## 5. Development Cycle

Recover → Verify → Continue → Implement → Test → Fix → Review → Checkpoint
→ Commit.

A task is not complete because code compiles. Completion requires:
implementation, relevant automated tests, validation (typecheck/lint/
boundaries/tests/build as applicable), a documentation/state update, and a
clean commit.

## 6. Financial Boundary (hard rule)

Claude may **implement technical infrastructure** for subscriptions,
shipping fees, payment processing, seller plans, ledger/accounting, and
settlement — all of that is normal engineering work.

Claude must **never independently decide**: prices, percentages,
commissions, revenue shares, seller charges, subscription amounts,
settlement percentages, listing limits (if undocumented), or any other
financial/commercial policy value.

If a task requires one of these values and it is not already documented in
`docs/BUSINESS_MODEL.md`, stop that specific decision, mark it clearly as
**OWNER DECISION REQUIRED**, implement everything else that doesn't depend
on it (fields nullable/fail-open, admin UI to set the value later), and
continue. Never invent a placeholder number and never treat a placeholder
as if it were approved.

See `docs/BUSINESS_MODEL.md` for the currently approved model — read it
before touching anything in `src/modules/{ledger,orders,payments,shipping,
subscriptions,settings}/`.

## 7. Product Direction

Souq Masr is a general classifieds marketplace (concept similar to Haraj):
cars, real estate, electronics, mobiles, furniture, jobs, services, general
goods, and other categories. Not every listing has checkout — classified/
contact-based listings and checkout-enabled physical-product listings
coexist by design (see `src/modules/catalog/` commerce-eligibility logic).
Do not assume every listing must support checkout, and do not remove
contact-only listings in favor of forcing checkout everywhere.

## 8. Egypt-Specific Requirements

Maintain, and verify before/after any relevant change:

- Arabic RTL throughout the UI.
- Egyptian phone-number validation (`src/modules/identity/phone.ts`).
- EGP currency formatting.
- All 27 Egyptian governorates (`prisma/seed.ts` / geo data) — never a
  partial list.
- Mobile responsiveness.
- Arabic-aware search (`pg_trgm` `word_similarity`, not plain `similarity`
  — see `docs/DECISIONS.md`).

Do not invent regulatory, tax, or legal requirements. Flag anything that
needs legal/tax/payment/shipping regulatory confirmation as **OWNER
DECISION REQUIRED** rather than guessing.

## 9. Testing and Validation

Run the checks relevant to the change: `npm run typecheck`, `npm run
lint`, `npm run boundaries`, `npm test` (Vitest, real Postgres/Redis, no
mocks — see existing suites in `tests/` for the established cleanup
pattern), `npx playwright test` for UI-affecting changes, `npm run build`
for anything that could break the production build, plus a manual
browser/curl check when the change is user-facing.

If a test fails: find the root cause, fix it, re-run, and check for
regressions elsewhere. Never weaken or delete a test to make it pass, and
never hide a failure.

## 10. Independent Review

Before considering an important phase complete, re-read your own
implementation adversarially. Look specifically for: missing
functionality, broken assumptions, duplicated logic, incorrect data flow,
authz/authn gaps, validation gaps, database inconsistencies, race
conditions (this codebase runs tests in parallel against one real
database — see existing cleanup-scoping patterns), API problems,
responsive/RTL problems, Egypt-specific gaps, financial logic accidentally
introduced without owner approval, and regressions in previously-working
features.

## 11. Git Safety

Never destroy history. Before any significant change: check `git status`,
confirm the current branch, and preserve any working-but-uncommitted
changes you find (investigate before overwriting — they may be
in-progress work, not debris).

Never `reset --hard`, force-push, or delete a branch unless explicitly
authorized for that specific action in that session. Never rewrite
published history. Always develop and push on
`claude/souq-masr-production-plan-g38qwv` unless explicitly told
otherwise for a specific session — **never push directly to `main`**.

After meaningful work: update docs and `PROJECT_STATE.md`, then create a
clean, descriptive commit.

## 12. Session Interruption / Recovery

If a session is approaching its limit: finish the current safe atomic
task, validate it, update `PROJECT_STATE.md` (completed work, remaining
work, current commit hash, exact next step), and stop in a clean,
committed state whenever possible. The next session must be able to
resume from `PROJECT_STATE.md` and `git log` alone, without any
conversation memory.

When a session resumes: don't assume the previous session's last claimed
action actually completed — verify it against the repository first
(Section 1).

## 13. Do Not Duplicate Existing Work

Before adding a table, API route, module, or component: search the
existing schema/`src/app/api/*`/`src/modules/*`/`src/components/*` first.
Reuse or extend what exists. If something looks similar to a need, read it
before deciding it's insufficient — do not build a parallel implementation
next to one that already does most of the job.

## 14. Security

Treat security as first-class on every change: authn/authz, input
validation, file-upload validation (magic bytes, never trust client
`Content-Type` — see the image pipeline), access control (ownership checks
on every mutating route), CSRF (`assertCsrf`/`csrfHeaders()` — already
wired on all mutating client fetches), rate limiting where relevant, SQL
safety (Prisma parameterization — never raw string interpolation into
SQL), XSS, IDOR, privilege escalation, and payment/financial boundaries.
Never commit secrets — `.env` is gitignored; verify `git status`/`git diff
--cached` before every commit that touches config.

## Reference Documents

- `PROJECT_STATE.md` — current phase, status, exact next step.
- `docs/BUSINESS_MODEL.md` — the owner-approved financial rules (Section 6
  above governs how to use it).
- `docs/OWNER_WORK_METHOD.md` — how to interpret the owner's requests
  across disciplines (engineering, PM, finance).
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`,
  `docs/DECISIONS.md`, `docs/design-system.md` — technical detail.
