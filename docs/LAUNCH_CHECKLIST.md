# RUNG launch checklist

_15 Nov 2026. ✅ done and tested · 🟡 built, waiting on an account or decision · ⬜ not started._

## Product
- ✅ Customer website, vendor dashboard, admin dashboard, mobile app (Android/iOS via Expo), English and Urdu
- ✅ Orders, bookings, refunds, payouts, KYC, audit log
- 🟡 Wallet payments (JazzCash, Easypaisa): built, tested on a local simulator only; need merchant sandbox accounts
- 🟡 Ask RUNG assistant: basic mode works; AI mode needs an Anthropic API key and a spend limit
- 🟡 Real SMS login codes: need an SMS provider (preview uses fixed test logins)
- ⬜ Voice input with a speech provider (keyboard microphone works now)

## Quality (Milestone 10)
- ✅ Lighthouse mobile, customer website (local production build, 5 pages): performance 94–99, accessibility 100, best practices 100, SEO 100. Measured locally; on free hosting the first visit after the API sleeps will be slow (about a minute)
- ✅ Automated accessibility checks (axe, WCAG 2.1 AA) on every page of the website (English and Urdu), vendor dashboard and admin, now part of the test suites
- ✅ Dependency audit: high-severity issues fixed; 1 moderate left in Expo's build tools (not shipped in the app)
- ✅ No secrets in the repository; production refuses unsafe settings
- 🟡 App on a real phone: needs Expo Go on your phone or an Expo account
- ⬜ Load test on paid hosting (free hosting sleeps, so numbers would be misleading)

## Hosting (free preview, `docs/DEPLOY.md`)
- 🟡 Neon, Render, Vercel accounts (Minahil creates them; about 30 minutes)
- 🟡 GitHub Actions secrets for scheduled jobs

## Business and legal (Minahil, with a professional)
- ⬜ Company registration and NTN (never a dummy one)
- ⬜ Trademark search for "RUNG / رنگ"
- ⬜ Privacy policy, terms, refund policy
- 🟡 Decisions still open: order response time (2 h), booking response time (24 h), commission (12% products / 10% services), first-order cash-on-delivery cap (Rs 5,000)
- ⬜ Real vendors onboarded (set `SEED_DEMO=0` and suspend the DEMO shops in admin)
