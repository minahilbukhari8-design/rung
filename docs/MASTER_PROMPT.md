# RUNG — Master build prompt (improved)

_Use this as the standing brief for every milestone. It is the original brief, tightened: clearer scope, acceptance criteria per milestone, and the rules made testable._

---

## 1. Product

**RUNG (رنگ)** — Lahore-first, all-occasion celebration marketplace (not wedding-only). Tagline: **Har Khushi, Har Rang · ہر خوشی، ہر رنگ**. Brand: Pakistani, modern, premium, colourful, elegant, warm. Brand assets and rules live in `brand/` (see `brand/BRAND_GUIDELINES.md`); never deviate from the palette, fonts or logo files.

Customers browse **by product, by service, by vendor, or by occasion** (Birthday, Mehndi, Dholki, Nikah, Walima, Baraat, Aqeeqa, Eid, Anniversary, Graduation, Baby shower, Corporate, Get well, Condolence).

One customer account, **two separate flows**:

1. **Product orders** — cakes, flowers, gifts/hampers, fashion. Variants (size, flavour, colour), customisation (message on cake, photo print, custom brief + reference image), inventory, cart (multi-vendor, split by vendor at checkout), delivery date + slot, delivery charge by vendor zone, sender ≠ recipient, gift message card, order tracking (placed → accepted → preparing → out for delivery → delivered with photo), cancellation window, refunds.
2. **Service bookings** — decor, catering, beauty (makeup/mehndi), photo/video, venues, entertainment. Packages with inclusions, availability calendar, booking request → vendor accepts/declines within SLA, advance payment → remaining payment, reschedule, cancellation per vendor policy, booking history.

Three roles plus admin: **customer, vendor (owner + staff), admin (ops, finance, support)**.

## 2. Stack (fixed)

TypeScript monorepo (pnpm + Turborepo). Next.js App Router for customer web, vendor dashboard and admin. Expo React Native for mobile. Postgres + Prisma. REST API (Node, Fastify or Next route handlers in a separate `apps/api`), OpenAPI spec generated and committed. Role-based auth with **Pakistani phone OTP** (+92 3XX XXXXXXX normalisation). S3-compatible storage (Cloudflare R2). i18n: English + **Urdu RTL** (Noto Nastaliq Urdu for display, Noto Naskh Arabic for dense UI). Money: **PKR as integer paisa** everywhere; never floats. Times stored UTC, shown in Asia/Karachi.

## 3. Milestones (one PR each, in order)

| # | Milestone | Done when |
|---|---|---|
| 1 | Research + brand identity | Market research, strategy, palette, typography, EN/UR SVG logos, app icon, guidelines, social + packaging concepts, accounts list, PROGRESS.md |
| 2 | PRD + data model | PRD with user stories + acceptance criteria for both flows; Prisma schema; ER diagram; state machines for order and booking; API endpoint list |
| 3 | Backend + tests | API for auth/OTP, catalogue, cart, checkout, orders, bookings, vendors, admin; seed script with **DEMO-labelled** data; unit + integration tests green in CI |
| 4 | Customer website | Browse by product/service/vendor/occasion, search incl. Roman Urdu, cart, checkout, booking, tracking, account; EN/UR toggle with full RTL; Lighthouse mobile ≥ 85; Playwright e2e for order + booking |
| 5 | Vendor dashboard | Onboarding + KYC upload, catalogue/packages, inventory, availability calendar, accept/decline, order/booking pipeline, payouts view |
| 6 | Admin dashboard | Vendor approval, category/occasion management, orders/bookings oversight, refunds, disputes, payouts, audit log |
| 7 | Mobile app | Expo app covering customer flows, push notifications, deep links; builds via EAS |
| 8 | Payments | Provider-agnostic `PaymentProvider` interface; JazzCash, Easypaisa, cards, bank transfer (proof upload), COD; advance/remaining for bookings; refunds; webhooks with signature checks; **sandbox only**; no escrow |
| 9 | AI assistant | First a written STT/TTS provider comparison for Urdu/Roman Urdu. Then: voice note → STT → **editable text** → LLM with tool calls that only read/write the real RUNG DB → answer + Urdu TTS. Must show a confirmation card before any purchase or booking. Never invents products, prices or availability |
| 10 | QA + launch | Full regression, security review, load test on checkout, deploy configs, backups, monitoring, launch checklist |

## 4. Every milestone must

1. Write the code on a branch, open **one PR** for the milestone.
2. Run lint, type-check and tests; fix failures; paste the real test summary in the PR.
3. Update `docs/PROGRESS.md`: done, pending, decisions, missing credentials, known bugs, test results, deploy status.
4. Keep `.env.example` current; never commit secrets.

## 5. Hard rules

- Never say something works without a passing test that proves it.
- Never say an integration is connected without a real sandbox call that succeeded.
- Never invent prices, vendors, reviews or availability. Seed data is visibly marked **DEMO** in the UI and DB (`isDemo = true`).
- Make non-critical decisions independently and log them in PROGRESS.md.
- **Ask before:** spending money, creating paid accounts, legal documents, anything irreversible (production deploy, real payments, deleting data, sending messages to real users).
- If blocked by a missing account or key, say exactly which account, why, and what the owner must do, then continue with everything else (mock provider + tests).
- Accessibility: WCAG AA contrast, keyboard navigation, RTL-correct focus order.
- Privacy: phone numbers and addresses are personal data; least-privilege access in admin; audit log for admin actions.

## 6. Out of scope (for now)

Cities other than Lahore, escrow, in-house rider fleet, loyalty points, multi-currency, marketplace ads auction.
