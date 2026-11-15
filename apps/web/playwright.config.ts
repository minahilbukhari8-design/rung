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
      env: {
        DATABASE_URL: E2E_DB, PORT: '4100', JWT_SECRET: 'e2e-secret-at-least-16', MOCK_SMS_OUTBOX_FILE: OUTBOX, NODE_ENV: 'development',
        // wallets point at the API's LOCAL SIMULATOR (test values, not real merchant credentials)
        PAYMENT_SIMULATOR: '1', PUBLIC_API_URL: 'http://localhost:4100', WEB_PUBLIC_URL: 'http://localhost:3100',
        JAZZCASH_MERCHANT_ID: 'SIM_MERCHANT', JAZZCASH_PASSWORD: 'sim-password', JAZZCASH_INTEGRITY_SALT: 'sim-salt-not-real', JAZZCASH_POST_URL: 'http://localhost:4100/api/v1/sandbox-sim/jazzcash',
        EASYPAISA_STORE_ID: 'SIM_STORE', EASYPAISA_HASH_KEY: 'simkey0123456789', EASYPAISA_INDEX_URL: 'http://localhost:4100/api/v1/sandbox-sim/easypaisa/index',
        EASYPAISA_CONFIRM_URL: 'http://localhost:4100/api/v1/sandbox-sim/easypaisa/confirm', EASYPAISA_INQUIRY_URL: 'http://localhost:4100/api/v1/sandbox-sim/easypaisa/inquire',
      },
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
