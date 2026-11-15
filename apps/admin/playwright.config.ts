import { defineConfig, devices } from '@playwright/test';

const E2E_DB = process.env.E2E_DATABASE_URL ?? 'postgresql://rung:rung_local_dev@localhost:5432/rung_e2e?schema=public';
export const OUTBOX = '/tmp/rung-admin-e2e-sms.jsonl';
export const API = 'http://localhost:4300';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://localhost:3300', trace: 'off', ...devices['Pixel 7'] },
  webServer: [
    {
      // fresh data every run: migrate, empty all tables, seed reference + DEMO data
      command: `rm -f ${OUTBOX} && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/db exec prisma migrate deploy && psql '${E2E_DB.split('?')[0]}' -q -f e2e/reset-db.sql && DATABASE_URL='${E2E_DB}' pnpm --filter @rung/api exec tsx src/seed.ts && pnpm --filter @rung/api exec tsx src/server.ts`,
      url: `${API}/health`,
      env: { DATABASE_URL: E2E_DB, PORT: '4300', JWT_SECRET: 'e2e-secret-at-least-16', MOCK_SMS_OUTBOX_FILE: OUTBOX, ADMIN_PHONE: '+923009990000', UPLOAD_DIR: '/tmp/rung-admin-e2e-uploads', NODE_ENV: 'development' },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec next start -p 3300',
      url: 'http://localhost:3300/login',
      env: { API_URL: API },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
