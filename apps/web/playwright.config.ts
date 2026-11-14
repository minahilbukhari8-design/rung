import { defineConfig, devices } from '@playwright/test';

const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://rung:rung_local_dev@localhost:5432/rung_e2e?schema=public';
export const OUTBOX = '/tmp/rung-e2e-sms.jsonl';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3100', trace: 'off', ...devices['Pixel 7'] },
  webServer: [
    {
      // fresh data every run: migrate, empty all tables, seed reference + DEMO data
      command: `rm -f ${OUTBOX} && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/db exec prisma migrate deploy && psql '${E2E_DB.split('?')[0]}' -q -f e2e/reset-db.sql && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/api exec tsx src/seed.ts && pnpm --filter @rung/api exec tsx src/server.ts`,
      url: 'http://localhost:4100/health',
      env: { DATABASE_URL: E2E_DB, PORT: '4100', JWT_SECRET: 'e2e-secret-at-least-16', MOCK_SMS_OUTBOX_FILE: OUTBOX, NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'rm -rf .next/cache/fetch-cache && pnpm exec next start -p 3100',
      url: 'http://localhost:3100',
      env: { API_URL: 'http://localhost:4100' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
