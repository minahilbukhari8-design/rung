# RUNG — PROGRESS

_Last updated: 14 Nov 2026 (Milestone 4)_

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Research + brand identity | ✅ Done (awaiting Minahil's review) |
| 2 | PRD + data model | ✅ Done (awaiting review) |
| 3 | Backend + tests | ✅ Done (awaiting review) |
| 4 | Customer website | ✅ Done (awaiting review) |
| 5 | Vendor dashboard | ⏳ Next |
| 6–10 | Admin → Launch | Not started |

## Milestone 1 — done

- Market + competitor research: `docs/research/market-research.md` (sources linked; unverified leads marked "verify")
- Business strategy: `docs/research/business-strategy.md`
- Brand guidelines: `brand/BRAND_GUIDELINES.md`
- Palette (8 colours + 4 text-safe deep variants, contrast measured), typography (Fraunces, Plus Jakarta Sans, Noto Nastaliq Urdu, Noto Naskh Arabic — all OFL, woff2 + licences in `brand/fonts/`)
- Logos: mark, EN horizontal/stacked, Urdu, bilingual, wordmarks; light + dark versions; text outlined so no font dependency (`brand/logos/`, PNG @2x in `brand/logos/png/`)
- App icon: iOS 1024 master, Android adaptive (foreground/background/monochrome), favicon, PNG sizes (`brand/app-icon/`)
- Social concepts: launch post, occasions grid, vendor recruitment, Urdu story (`brand/social/`)
- Packaging concepts: cake box lid, gift bag, card/tag/sticker/delivery label (`brand/packaging/`)
- Improved master prompt: `docs/MASTER_PROMPT.md`
- Accounts + keys list with cost notes: `docs/ACCOUNTS_AND_KEYS.md`
- Generator sources: `brand/source/gen.py`, `mock.py`, `render.js`

## Milestone 4 — done

- `apps/web`: Next.js 15 (App Router) customer website in brand style (Fraunces / Plus Jakarta Sans / Noto Nastaliq + Naskh, brand palette)
  - English ⇄ Urdu switch with full RTL (`<html dir="rtl">`), Urdu listing fields when present
  - Home (occasions grid, products, services), occasion pages, product/service lists by category, search (Roman Urdu variants), vendor storefronts
  - Product page: variants, customization fields with surcharges, quantity, add to cart; Service page: packages, advance amount, cancellation tiers, availability check, booking request
  - Cart + checkout: per-vendor delivery date and live slot list, recipient address (zone auto-matched), gift message, hide-sender option, COD / test payment / bank transfer, server quote
  - Orders and bookings: list + detail with status timeline, cancel, refund shown, pay advance/remaining (test payment)
  - Security: tokens only in httpOnly cookies via a server proxy (`/bff/*`) with silent refresh and same-origin check; security headers; DEMO badge on every demo listing
- Playwright end-to-end tests (`apps/web/e2e`) against a real API + Postgres, on a phone viewport

### Milestone 4 decisions
16. Pages that show prices, stock or IDs the customer acts on are fetched fresh (no cache); lists are cached 60 s.
17. OTP limit: 3 codes per number per 15 min, 20 per IP (mobile carriers share IPs).
18. No images yet: placeholder brand mark until vendors upload photos (uploads endpoint is Milestone 5).

## Milestone 3 — done

- `apps/api`: Fastify REST API under `/api/v1` with zod validation and a single error format
  - Phone OTP login (hashed codes, 5-min expiry, 5 attempts, 3 sends/15 min per number or IP), JWT access + rotating refresh tokens, addresses with automatic Lahore zone matching
  - Catalogue: occasions, categories, zones, products/services with filters, vendor pages, reviews, search with Roman Urdu/Urdu spelling variants, delivery slots (capacity, lead time, same-day cut-off, blackouts), service availability calendar
  - Cart, checkout quote, multi-vendor checkout (atomic stock reservation, customization validation + surcharges, vendor zones/min order, COD cap Rs 5,000 on first order, idempotency keys), payment failure → orders cancelled + stock restored
  - Order lifecycle for vendor/customer/system with delivery-photo rule, cancellation window, automatic refunds, SLA auto-reject job
  - Bookings: request (24 h notice, guest limits, per-day capacity), vendor accept/decline, advance + remaining payments, reschedule with the other party's approval (max 2), tiered refunds frozen at booking time, vendor cancellation = full refund, expiry job
  - Vendor onboarding, zones, slots, product + service creation (blocked from going live until approved), admin approve/reject/suspend with audit log
- Adapters: SMS and payments are **mock only** (MOCK gateway marks `isSandbox=true`); COD and bank transfer (proof upload, no invented bank details)
- `apps/api/src/seed.ts`: reference data (14 occasions, 10 categories, 5 Lahore zones) + **DEMO**-labelled vendors/products/services with placeholder prices
- CI workflow `.github/workflows/ci.yml` (Postgres service, typecheck + all tests) — will run once pushed to GitHub

### Milestone 3 decisions
12. Stock is reserved at checkout (including pending online payment) and released on cancel/reject/payment failure.
13. COD orders skip PENDING_PAYMENT; the COD payment stays PENDING until collection is recorded (Milestone 8).
14. A reschedule returns the booking to its previous status; accepting moves the event date.
15. Bookings need ≥ 24 h notice; vendor response deadline is 24 h or the event time, whichever is sooner.

## Milestone 2 — done

- PRD with user stories + acceptance criteria for both flows: `docs/prd/PRD.md`
- Data model (36 Prisma models, ER diagram, key decisions): `packages/db/prisma/schema.prisma`, `docs/prd/DATA_MODEL.md`
- Order + booking state machines (diagrams + code): `docs/prd/STATE_MACHINES.md`, `packages/domain/src/`
- REST endpoint plan: `docs/prd/API.md`
- Monorepo skeleton (pnpm + Turborepo), `.env.example` with every external value marked PLACEHOLDER
- Local git repo with branches `main` → `milestone/1-research-brand` → `milestone/2-prd-data-model`, ready to push

### Milestone 2 decisions
7. Multi-vendor cart = one OrderGroup + one Order per vendor, single payment.
8. Snapshots of prices/titles/addresses/cancellation policy on orders and bookings.
9. Vendor response SLA defaults: 2 h for orders, 24 h for booking requests; advance due 48 h after acceptance; max 2 reschedules.
10. Customer cancellation of an accepted order allowed until 24 h before slot (vendor-configurable).
11. Placeholder commission 12% (products) / 10% (services) until vendor interviews.

## Decisions made (non-critical, made independently)

1. Mark concept "Rang Phool": six-colour petal flower; each petal is a palette colour.
2. Primary pair Shab `#2B1236` + Rani `#D6246E` on Dupatta ivory `#FBF4EA`.
3. Urdu UI uses **Naskh** for dense text and **Nastaliq** for display only (readability on phones).
4. Western digits for prices/phones in both languages.
5. Logo SVGs ship with outlined text (no runtime font dependency).
6. Recommended infra defaults: Neon (Postgres), Cloudflare R2, Vercel + Railway/Render. Not signed up.

## Pending / needs Minahil

- **Create the empty private GitHub repo `rung`** (github.com/new) and give the Claude GitHub App access → then Milestones 1 and 2 are pushed as PRs. Until then work is committed in the local git repo inside `RUNG/`.
- Review brand direction (logo, colours). Changes are cheap: edit `brand/source/gen.py` and re-export.
- Decide on company registration / NTN (gates payments, branded SMS, WhatsApp verification).
- Trademark search for "RUNG / رنگ" (legal; needs your go-ahead).

## Missing credentials

None needed yet for Milestone 2. Full list: `docs/ACCOUNTS_AND_KEYS.md`.

## Tests

**Milestone 4 (14 Nov 2026):**
- Web: `next build` succeeds; `tsc` clean; **Playwright e2e 5/5 passing** (home + Urdu RTL switch, Roman Urdu search, full cake order for a recipient with test payment then cancel + refund, decor booking request, login redirect). Verifies tokens are httpOnly and not readable by page scripts.
- API: 33/33 passing (added OTP shared-IP limit test).
- Not yet measured: Lighthouse mobile score (target ≥ 85) — to run on the deployed preview.

**Milestone 3 (14 Nov 2026):**
- `apps/api`: **32/32 integration tests passing** against real Postgres 16 (auth/OTP 6, catalogue 6, cart/checkout 9, order lifecycle 4, bookings 6, admin/onboarding 1); run twice, stable. `tsc --noEmit` clean.
- Server smoke test: `/health` OK, `/api/v1/search?q=cake` returns the DEMO cake with Urdu variants.
- Domain 24/24 and DB 1/1 still passing.

**Milestone 2 (14 Nov 2026):**
- `packages/domain`: **24/24 passing** (vitest) — money/paisa maths, PK phone normalisation, order + booking state machines, tiered refunds, enum parity with schema. `tsc --noEmit` clean.
- `packages/db`: `prisma validate` OK; `prisma migrate dev` applied `init` on local Postgres 16 (38 app tables); integration test **1/1 passing** (creates a full demo order + booking, checks constraints, rolls back).

**Milestone 1** has no application code. Checks run:
- All logos/icons rendered in Chromium (Playwright) and visually inspected; Urdu shaping via HarfBuzz verified on screen (رنگ, ہر خوشی، ہر رنگ).
- Colour contrast computed with the WCAG 2.1 formula (values in the guidelines).

## Known issues

- Payment webhooks, JazzCash/Easypaisa/card adapters, refunds to real gateways: Milestone 8 (need merchant accounts).
- WhatsApp/SMS notifications are not sent yet beyond OTP (mock); notification fan-out comes with Milestone 4/5.
- Uploads (`/uploads/sign`), reviews endpoints, payouts generation and OpenAPI file are planned but not built yet.
- Expiry jobs run via `POST /admin/jobs/expire`; a real scheduler is set up at deploy time (Milestone 10).

- Social/packaging images are concept renders, not print-ready dielines.
- `brand/source/*.py` expect fonts in a local `fonts/` folder (paths at top of file); will be made repo-relative when moved into the monorepo.
- Competitor table includes some "(verify)" items not yet confirmed.

## Deploy status

Nothing deployed. No accounts created. Payments, SMS, WhatsApp, storage and AI are placeholder/mock only.
