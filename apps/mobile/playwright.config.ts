import { defineConfig, devices } from '@playwright/test';

const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://rung:rung_local_dev@localhost:5432/rung_e2e?schema=public';
export const OUTBOX = '/tmp/rung-mobile-e2e-sms.jsonl';
export const API = 'http://localhost:4500';
const WEB = 'http://localhost:3500';

/** The Expo app's web build, driven on a phone-sized viewport against the real API and Postgres. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: WEB, trace: 'off', ...devices['Pixel 7'] },
  webServer: [
    {
      command: `rm -f ${OUTBOX} && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/db exec prisma migrate deploy && psql '${E2E_DB.split('?')[0]}' -q -f e2e/reset-db.sql && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/api exec tsx src/seed.ts && pnpm --filter @rung/api exec tsx src/server.ts`,
      url: `${API}/health`,
      env: { DATABASE_URL: E2E_DB, PORT: '4500', JWT_SECRET: 'e2e-secret-at-least-16', MOCK_SMS_OUTBOX_FILE: OUTBOX, NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `EXPO_OFFLINE=1 CI=1 EXPO_PUBLIC_API_URL=${WEB} npx expo export --platform web --clear && node e2e/serve.mjs`,
      url: WEB,
      env: { PORT: '3500', API_URL: API },
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
