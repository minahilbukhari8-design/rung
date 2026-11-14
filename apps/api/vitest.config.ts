import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-at-least-16-chars',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://rung:rung_local_dev@localhost:5432/rung_test?schema=public',
      OTP_PROVIDER: 'mock',
    },
  },
});
