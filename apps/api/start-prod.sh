#!/bin/sh
# Production start (Render free has no shell or pre-deploy step, so this runs on every start).
# 1. apply database migrations  2. seed reference data (+ DEMO listings when SEED_DEMO=1) and the first admin  3. start the API
set -e
cd "$(dirname "$0")"
pnpm --filter @rung/db exec prisma migrate deploy
if [ "$SEED_DEMO" = "1" ]; then npx tsx src/seed.ts; else npx tsx src/seed.ts --no-demo; fi
exec npx tsx src/server.ts
