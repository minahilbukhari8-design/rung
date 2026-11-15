# RUNG — PROGRESS

_Last updated: 15 Nov 2026 (Milestone 10)_

## Status by milestone

| # | Milestone | Status |
|---|---|---|
| 1 | Research + brand identity | ✅ Done (awaiting Minahil's review) |
| 2 | PRD + data model | ✅ Done (awaiting review) |
| 3 | Backend + tests | ✅ Done (awaiting review) |
| 4 | Customer website | ✅ Done (awaiting review) |
| 5 | Vendor dashboard | ✅ Done (awaiting review) |
| 6 | Admin dashboard | ✅ Done (awaiting review) |
| 7 | Mobile app (Expo) | ✅ Done (awaiting review) |
| 8 | Payments (sandbox) | ✅ Built; wallets tested on a local simulator only, not connected (needs merchant sandbox accounts) |
| 9 | AI assistant | ✅ Built; runs in basic (no-AI) mode until an Anthropic key is added |
| 10 | QA + launch prep | ✅ Ready for a free preview; deploy waits on Minahil's free accounts (Neon, Render, Vercel) |

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

## Milestone 10 — QA and launch prep

- Free-hosting plan (Minahil: free hosting, no paid domain): Neon database, Render free API, Vercel Hobby for the three web apps, GitHub Actions for hourly jobs. Steps and limits: `docs/DEPLOY.md`. Blueprint: `render.yaml`.
- Launch checklist with what is done and what waits on accounts or decisions: `docs/LAUNCH_CHECKLIST.md`.
- For free hosting: uploaded files can be kept in the database (`FILE_STORAGE=db`); fixed test logins for listed tester phones (`PREVIEW_TEST_LOGINS`) until an SMS account exists; `POST /api/v1/jobs/run` for the scheduler, plus a 5-minute timer while the API is awake; the API refuses to start in production with unsafe settings.
- Lighthouse (mobile, local production build): performance 94–99, accessibility 100, best practices 100, SEO 100 on home, product, service, search and assistant pages.
- Accessibility: axe (WCAG 2.1 AA) checks on every page of the website (English and Urdu), vendor dashboard and admin, now in the e2e suites. Fixed: occasion tile colours (white text now only on text-safe brand tones, web and app), a time field label, heading order, underlined links in text, keyboard access to scrolling admin tables.
- Security: dependency audit (zod 4, postcss and deepmerge-ts patched; 1 moderate left inside Expo's build tools), security headers on the API and all web apps, admin and vendor dashboards marked noindex, secrets scan clean.

### Milestone 10 decisions
38. Free preview stack: Neon + Render + Vercel Hobby. Vercel Hobby is non-commercial only, so a real launch needs a different plan (Minahil's decision, it costs money).
39. Files go in Postgres on free hosting because Render's disk is wiped on restart; move to a bucket before launch.
40. Test logins use fixed codes only for phones Minahil lists, never `123456` or repeated digits, and switch off once a real SMS provider is set.
41. Scheduled jobs run hourly from GitHub Actions (fits a private repo's free minutes) and every 5 minutes while the API is awake.

## Milestone 9 — built (AI off until a key is added)

- **Ask RUNG** chat on the website (`/assistant`, in the main menu) and in the app (button on the home screen), English / Urdu / Roman Urdu. Details: `docs/ASSISTANT.md`.
- Two modes: a basic keyword helper (default, no account needed) and Claude with four read-only tools over the live catalogue and the customer's own orders. Switches to Claude only when a real `ANTHROPIC_API_KEY` is set.
- Cards under each reply come from the database, so the assistant cannot show a made-up product, shop or price.
- Urdu voice: desk comparison of Azure, Google, ElevenLabs, Uplift AI and Soniox in `docs/research/urdu-voice.md`; for now customers use the keyboard microphone. A real bake-off needs trial accounts.

### Milestone 9 decisions
33. The assistant is read-only: it never orders, pays or cancels.
34. Listing cards are built by the server from tool results, not from the AI's words.
35. Message text is not stored; only usage (engine, time, turns) is logged.
36. Default model `claude-opus-5-5` at low effort, with refusal fallback; a cheaper model is Minahil's call after real usage is measured.
37. Voice input starts with the phone keyboard microphone (free); a paid speech provider is picked only after testing on real Lahori voice notes.

## Milestone 8 — built (sandbox only, not connected)

- JazzCash and Easypaisa wallet payments for orders and booking payments, on the website and in the app. Details and go-live checklist: `docs/PAYMENTS.md`.
- One place (`settlePayment`) turns a payment result into order and booking changes, safe against the same reply arriving twice, wrong amounts and late payments.
- Signed, expiring start links; JazzCash replies checked by signature; Easypaisa status always confirmed with its inquiry API; bad replies logged for the admin team.
- Finance's bank transfer confirm / reject now uses the same path; wallet payments waiting for review appear in the same admin queue.
- Customer result page on the website and a payment result screen in the app (opens the wallet in an in-app browser and comes back to `rung://payment-result`).
- A local wallet simulator (`PAYMENT_SIMULATOR=1`, never in production) for automated tests.
- **Not connected to real JazzCash or Easypaisa.** That needs their merchant sandbox credentials (see `docs/ACCOUNTS_AND_KEYS.md`). Card payments are not built (no gateway chosen).

### Milestone 8 decisions
28. A wallet only appears at checkout when its credentials are real; placeholders keep it hidden.
29. RUNG never trusts the customer's browser coming back from a wallet. JazzCash replies must carry a valid signature; Easypaisa status is always asked from Easypaisa directly.
30. If a wallet reports a different amount than RUNG asked for, nothing is placed and finance reviews it.
31. Wallet refunds are made by finance in the merchant portal and recorded in the admin dashboard until each wallet's refund API is verified in sandbox.
32. The app returns from the wallet only to `rung://` or addresses listed in `APP_RETURN_ORIGINS`, so a link cannot send customers to another site.

## Milestone 7 — done

- `apps/mobile`: customer app for Android and iOS (Expo SDK 58, Expo Router), English ⇄ Urdu with right-to-left layout, brand colours, app icon, adaptive Android icon and splash from the brand kit
  - Home (occasions, DEMO products and services), occasion pages, search (Roman Urdu), product (options, cake message, quantity), service (packages, advance, refund tiers, booking request)
  - Cart and checkout: recipient address, delivery date and live slot per shop, gift message, sender name, test payment / cash on delivery / bank transfer, server quote
  - Account: orders and bookings; detail screens with status timeline, cancel (refund shown), pay advance / remaining with test payment
  - Login by phone code; tokens in the phone's secure storage (Keychain / Keystore) with automatic refresh
- `eas.json` profiles for test APKs and store builds (API URLs are placeholders until deploy)

### Milestone 7 decisions
25. The app talks to the API directly with bearer tokens kept in secure storage (no cookies on phones). The web export is only used for automated tests.
26. Metro is told to resolve `./x.js` imports to `./x.ts` for the shared `packages/domain` code, so the app uses the same money and status rules as the server.
27. `android/` and `ios/` are generated by Expo (`expo prebuild`) and not committed.

## Milestone 6 — done

- `apps/admin` (port 3002): Next.js admin dashboard for the RUNG team (English), works on phone and desktop, same secure cookie proxy (separate cookies from the vendor and customer apps)
  - Overview: queues waiting on the team (shops to review, KYC, bank transfers to check, refunds to send, late orders), today's orders, last-7-days delivered value and commission
  - Vendors: review by status, details (team, documents, counts), approve / reject / suspend with reason, set commission per shop
  - KYC: open private documents, accept or reject with a note; a shop is marked “CNIC verified” when both sides are accepted
  - Orders and bookings: search by number or phone, status filters, full timeline, cancel with reason (refunds follow the rules)
  - Payments: confirm a bank transfer with the bank reference (order goes to the shop) or mark it not received (order cancelled, stock returned)
  - Refunds: approve / reject requested refunds, record manual refunds as sent with a reference
  - Payouts: build one payout per shop for a finished period (delivered orders + completed bookings, minus commission), hold / release, mark paid with a reference; shops see it in Earnings
  - Users: search, block (logs them out everywhere) and unblock
  - Audit log: every admin action with who, when and IP
- Admin permissions: OPS (shops, KYC), FINANCE (payments, refunds, payouts), SUPPORT (orders, bookings, users, reviews), SUPERADMIN (all). The first admin is created from `ADMIN_PHONE` when seeding.

### Milestone 6 decisions
22. The admin dashboard is English only (internal team tool); customer and vendor apps stay bilingual.
23. Bank transfer refunds are never marked “sent” automatically; they wait in Refunds until finance records the transfer reference. (Fixed a bug where they were marked processed with no money moved.)
24. Payouts are built only for finished periods and only once per shop per period.

## Milestone 5 — done

- `apps/vendor` (port 3001): Next.js vendor dashboard, English ⇄ Urdu with RTL, phone-first layout, same secure cookie proxy as the website
  - Apply to open a shop (products, services or both); "under review" notice until admin approval
  - Overview: counts of new orders, in-progress orders, new booking requests, confirmed bookings, low stock; new orders inline
  - Orders: tabs by status; accept / reject with reason / start preparing / out for delivery / delivered with a photo / delivery failed; respond-by time shown
  - Bookings: accept / decline with reason, mark completed
  - Catalogue: add products (variants, price, stock, preparation time) and services (packages, advance %, refund tiers, bookings per day); publish / pause; edit price and stock; upload product photos
  - Delivery & schedule: delivery areas with charge, minimum order and same-day cutoff; weekly delivery slots with capacity; closed days; staff by phone (owner only)
  - Documents: KYC upload (CNIC, NTN, bank proof), stored privately
  - Earnings (owner only): delivered order totals after commission, booking collections, payouts
- API additions (`apps/api/src/routes/vendor.ts`): file uploads (5 MB, file type checked from its bytes, private KYC files readable only by the uploader and admins), vendor profile, documents, catalogue editing, zones/slots/closed days, staff roles, stats, earnings
- Local file storage adapter until object storage (Cloudflare R2) is set up

### Milestone 5 decisions
19. Uploads go through the API as base64 (5 MB cap) and are stored on local disk for now; switching to R2 signed uploads needs the R2 account.
20. Staff can handle orders, bookings and catalogue; only owners see earnings and manage staff.
21. New listings start as Draft; the vendor publishes them, and they appear to customers only once the shop is approved.

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

**Milestone 10 (15 Nov 2026):**
- API **77/77** (5 new: production refuses unsafe settings; test logins only for listed phones and off with real SMS; files in the database come back byte for byte; jobs endpoint needs the token; security headers). Domain 24/24, DB 1/1 (on a clean database), app unit 7/7, `pnpm -r typecheck` clean.
- e2e: website **9/9**, vendor **5/5**, admin **5/5** (each now includes axe accessibility checks), app **6/6**.
- Production start checked on an empty database: migrations, seed, admin, health and search all work; it refuses a laptop database URL.
- Not tested: the real free hosts (no accounts yet), a physical phone, load.

**Milestone 9 (15 Nov 2026):**
- API: **72/72 passing** (10 new assistant tests: basic mode without a key; budgets like "5k tak" and "3,000 se kam"; Roman Urdu and Urdu requests find the real DEMO listings and respect the budget; order questions need a login; Claude tool loop with a scripted stand-in for the API: tools called, results fed back, cards only from the database, a made-up product never becomes a card; order data only for the logged-in customer; unknown tools and bad input reported back, not crashed; refusal reply; outage gives 503; input limits and rate limit).
- Website e2e **8/8** (new: Ask RUNG in Roman Urdu → DEMO mehndi decor card → opens the listing). App e2e **6/6** (new: Ask RUNG from home → DEMO cake → opens it). App unit 7/7.
- Not tested: the real Claude API (no key yet); any speech provider.

**Milestone 8 (15 Nov 2026):**
- API: **62/62 passing** (13 new payment tests: JazzCash and Easypaisa signatures checked against independently computed values; paid settles once even if the reply repeats; tampered, forged and unsigned replies refused; amount mismatch held for review; decline cancels and restocks; voucher stays waiting; late payment after cancel creates a refund request; start links signed and expiring; app return only to rung://; booking advance confirms the booking; Easypaisa's unsigned return not trusted, inquiry decides; admin review queue).
- Website e2e **7/7** (2 new: JazzCash approve → order placed; Easypaisa decline → order cancelled, "no money taken"). Both run against the **local simulator**, not the real gateways.
- App e2e **5/5** (1 new: JazzCash approve from the app → payment result → order placed, local simulator). Mobile unit tests 7/7, `tsc` clean.
- Not tested: the real JazzCash and Easypaisa sandboxes (no merchant accounts yet); the in-app browser return on a physical phone.

**Milestone 7 (15 Nov 2026):**
- Mobile: `tsc` clean; **unit tests 7/7** (API client: tokens saved on login, bearer header, one shared refresh for parallel requests, logout when refresh fails, API errors; Pakistan dates; every English string has Urdu).
- `expo prebuild` generates the Android (`pk.rung.app`) and iOS projects from the config without errors (generated folders not committed).
- **Playwright e2e 4/4, run three times** on the app's web build at phone size against the real API + Postgres: home + Urdu RTL switch, Roman Urdu search, login → add cake → address → date and slot → test payment → order placed → cancel → refund processed, decor booking request.
- Not tested on a physical phone yet: needs Expo Go on a phone, or an Expo account for an installable test build.
- CI now also runs the mobile unit tests.

**Milestone 6 (15 Nov 2026):**
- API: **49/49 passing** (7 new admin tests: permission areas, KYC review and verification, bank transfer confirm and reject with stock return, manual refund recorded, sandbox refund on admin cancel, payouts once per period, user block logs out and stops login).
- Admin app: `tsc` clean, `next build` succeeds; **Playwright e2e 4/4 passing, run twice** (non-admin refused, KYC accept + shop approval with the private PDF opened through the dashboard, bank transfer confirm → cancel → refund recorded → audit log, block/unblock).
- Customer website e2e 5/5 and vendor e2e 4/4 re-run: still passing.

**Milestone 5 (14 Nov 2026):**
- API: **42/42 passing** (added 9 vendor/upload tests: membership, stock/price/status edits, closed days remove slots, staff permissions, earnings after delivery, private KYC access, file-type and size checks, public product image, path tricks refused).
- Vendor app: `tsc` clean, `next build` succeeds; **Playwright e2e 4/4 passing** (login redirect + new shop application, DEMO bakery accepts a real sandbox order and moves it to out for delivery, add product as draft then publish, Urdu RTL).
- Customer website e2e re-run: 5/5 still passing.

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

- JazzCash and Easypaisa are built but checked only against RUNG's own simulator; field names come from public merchant code, not the official guides. Card payments not built.
- WhatsApp/SMS notifications are not sent yet beyond OTP (mock); notification fan-out comes with Milestone 4/5.
- Reviews endpoints, payout generation and the OpenAPI file are planned but not built yet. Uploads use local disk until R2 is set up.
- Expiry jobs run via `POST /admin/jobs/expire`; a real scheduler is set up at deploy time (Milestone 10).

- Social/packaging images are concept renders, not print-ready dielines.
- `brand/source/*.py` expect fonts in a local `fonts/` folder (paths at top of file); will be made repo-relative when moved into the monorepo.
- Competitor table includes some "(verify)" items not yet confirmed.

## Deploy status

Nothing deployed yet. Free preview ready to deploy: `docs/DEPLOY.md` (Minahil creates Neon, Render and Vercel accounts). No accounts created. Mobile store builds need an Expo account (free), Google Play (USD 25 once) and Apple Developer (USD 99/year). Payments, SMS, WhatsApp, storage and AI are placeholder/mock only.
