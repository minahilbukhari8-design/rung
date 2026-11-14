# RUNG (رنگ) — Har Khushi, Har Rang

Lahore's all-occasion marketplace: order cakes, flowers, gifts and fashion, and book decor, catering, beauty, photography, venues and entertainment, from one account.

- `docs/MASTER_PROMPT.md` — the build brief for all 10 milestones
- `docs/PROGRESS.md` — what's done, pending, decisions, blockers
- `docs/ACCOUNTS_AND_KEYS.md` — accounts the owner must open, with costs
- `docs/research/` — market research and business strategy
- `brand/` — guidelines, logos, app icon, fonts, social and packaging concepts
- `docs/prd/` — PRD, data model, state machines, API plan
- `packages/db` — Prisma schema + migrations (`pnpm --filter @rung/db test` needs `DATABASE_URL`)
- `packages/domain` — money, phone, order/booking rules (`pnpm --filter @rung/domain test`)

## Local setup

```bash
pnpm install
cp .env.example packages/db/.env   # local Postgres URL; all other values are placeholders
pnpm --filter @rung/db exec prisma migrate dev
pnpm --filter @rung/domain test && pnpm --filter @rung/db test
```
