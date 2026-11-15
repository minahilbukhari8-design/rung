# Deploying RUNG on free hosting (preview)

_Milestone 10, 15 Nov 2026. Minahil asked for free hosting and no paid domain for now. Limits below were read from each provider's own pages on 15 Nov 2026 and can change._

This is a **preview** for testing with friends and vendors: sandbox payments, DEMO listings, test logins. It is **not** set up for real customers or real money.

## The free setup

| Part | Where | Free address | Key limits (free plan) |
|---|---|---|---|
| Database | **Neon** (Postgres) | n/a | 1 GB storage per project, 100 compute-hours a month, sleeps after 5 minutes idle, 6 hours of restore history, no scheduled backups. ([Neon free plan](https://neon.com/docs/introduction/free-tier)) |
| API | **Render** free web service, Singapore region | `rung-api.onrender.com` style | 512 MB RAM, sleeps after 15 minutes without traffic and takes **about a minute to wake**, 750 instance-hours a month per workspace, disk wiped on restart; Render says free instances are not for production. ([Render free](https://render.com/free)) |
| Customer website, vendor dashboard, admin | **Vercel** Hobby (3 projects) | `*.vercel.app` | **Personal, non-commercial use only** under Vercel's terms: fine for a preview, not for a live business. ([Vercel Hobby](https://vercel.com/docs/plans/hobby), [fair use](https://vercel.com/docs/limits/fair-use-guidelines)) |
| Uploaded files (KYC, photos) | Inside the Neon database (`FILE_STORAGE=db`) | n/a | Counts toward the 1 GB. Fine for a preview; move to a file bucket before launch. |
| Scheduled jobs | **GitHub Actions**, hourly (`.github/workflows/jobs.yml`) | n/a | About 720 of the 2,000 free minutes a month for a private repo. The API also runs the jobs every 5 minutes while awake. |
| Logins | Test logins (`PREVIEW_TEST_LOGINS`) | n/a | Fixed 6-digit codes for listed tester phones only, because no SMS account exists yet. |

Not chosen: Render free Postgres (deleted after 30 days), Fly.io (no free allowance any more), Netlify free (300 credits a month, about 20 deploys across all sites, and every site pauses when the limit is hit). Source for these: [free tiers compared, Sept 2026](https://flaviocopes.com/hosting-free-tiers.md).

## Steps (Minahil creates the accounts; I never sign up for anything)

1. **Neon:** sign up, create project `rung` in the Singapore region, copy the connection string (`postgresql://…neon.tech/neondb?sslmode=require`).
2. **Render:** sign up with GitHub, choose *New → Blueprint*, pick the `rung` repo. It reads `render.yaml`. Fill in the values it asks for:
   - `DATABASE_URL`: the Neon string.
   - `PUBLIC_API_URL`: the https address Render shows for the service.
   - `WEB_PUBLIC_URL`: the customer website address from step 3 (fill it in after step 3).
   - `ADMIN_PHONE`: your number as `+923…`.
   - `PREVIEW_TEST_LOGINS`: tester numbers with codes you choose, e.g. `03001234567:482913`. Not `123456` or repeated digits.
   - `ANTHROPIC_API_KEY`: leave empty; the assistant runs in basic mode.
   On first start the API sets up the database, adds occasions, categories, DEMO shops and your admin account, then starts. It refuses to start if a setting is unsafe, and the log says which.
3. **Vercel:** sign up with GitHub and import the `rung` repo **three times**, with Root Directory `apps/web`, `apps/vendor` and `apps/admin`. For each, add the environment variable `API_URL` = the Render address. Vercel detects Next.js and pnpm itself.
4. **GitHub:** in the repo's Settings → Secrets → Actions, add `RUNG_API_URL` (Render address) and `RUNG_JOBS_TOKEN` (copy `JOBS_TOKEN` from Render's environment page).
5. Open the website, log in with a test number and code, and walk through: browse, order a DEMO cake with the test payment, open the vendor dashboard as the DEMO bakery owner, open the admin dashboard with your number.

## What a visitor will notice

- The first visit after a quiet spell can take **about a minute** while the API wakes up.
- Payments are sandbox only (test payment, cash on delivery, bank transfer). JazzCash and Easypaisa stay hidden until their sandbox credentials are added.
- Everything that is demo is marked DEMO.

## Before a real launch (costs money or needs accounts, so needs Minahil's go-ahead)

- Hosting that allows commercial use and an always-on API, so there is no one-minute wake-up.
- A database plan with backups.
- A file bucket (e.g. Cloudflare R2) instead of files in the database.
- An SMS provider for real login codes; then remove `PREVIEW_TEST_LOGINS`.
- JazzCash / Easypaisa merchant accounts tested in sandbox (`docs/PAYMENTS.md`).
- A domain (e.g. `rung.pk`) when you are ready to pay for one.
- Company registration, and privacy, terms and refund policy pages checked by a professional.
