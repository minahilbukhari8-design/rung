# RUNG — PROGRESS

_Last updated: 14 Nov 2026 (Milestone 2)_

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Research + brand identity | ✅ Done (awaiting Minahil's review) |
| 2 | PRD + data model | ✅ Done (awaiting review) |
| 3 | Backend + tests | ⏳ Next |
| 4–10 | Website → Launch | Not started |

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

**Milestone 2 (14 Nov 2026):**
- `packages/domain`: **24/24 passing** (vitest) — money/paisa maths, PK phone normalisation, order + booking state machines, tiered refunds, enum parity with schema. `tsc --noEmit` clean.
- `packages/db`: `prisma validate` OK; `prisma migrate dev` applied `init` on local Postgres 16 (38 app tables); integration test **1/1 passing** (creates a full demo order + booking, checks constraints, rolls back).

**Milestone 1** has no application code. Checks run:
- All logos/icons rendered in Chromium (Playwright) and visually inspected; Urdu shaping via HarfBuzz verified on screen (رنگ, ہر خوشی، ہر رنگ).
- Colour contrast computed with the WCAG 2.1 formula (values in the guidelines).

## Known issues

- Social/packaging images are concept renders, not print-ready dielines.
- `brand/source/*.py` expect fonts in a local `fonts/` folder (paths at top of file); will be made repo-relative when moved into the monorepo.
- Competitor table includes some "(verify)" items not yet confirmed.

## Deploy status

Nothing deployed. No accounts created. Payments, SMS, WhatsApp, storage and AI are placeholder/mock only.
