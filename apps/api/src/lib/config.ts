/**
 * Refuse to start in production with settings that are only safe on a laptop.
 * Returns the problems so tests can check them; server.ts exits when any are found.
 */
export function productionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const out: string[] = [];
  const secret = env.JWT_SECRET ?? '';
  if (secret.length < 32 || /change-me|PLACEHOLDER|e2e/i.test(secret)) out.push('JWT_SECRET must be a random value of at least 32 characters');
  if (!env.DATABASE_URL || /rung_local_dev|localhost/.test(env.DATABASE_URL)) out.push('DATABASE_URL must point at the hosted database');
  for (const k of ['PUBLIC_API_URL', 'WEB_PUBLIC_URL'] as const) if (!env[k]?.startsWith('https://')) out.push(`${k} must be the public https address`);
  if (env.PAYMENT_SIMULATOR === '1') out.push('PAYMENT_SIMULATOR must be off in production');
  if (env.MOCK_SMS_OUTBOX_FILE) out.push('MOCK_SMS_OUTBOX_FILE must not be set in production');
  if ((env.FILE_STORAGE ?? 'local') === 'local') out.push('FILE_STORAGE=local loses uploads on free hosts; use FILE_STORAGE=db');
  if (env.JOBS_TOKEN !== undefined && env.JOBS_TOKEN.length < 24) out.push('JOBS_TOKEN must be at least 24 characters');
  for (const k of ['JAZZCASH_MODE', 'EASYPAISA_MODE'] as const) if (env[k] === 'live') out.push(`${k}=live needs Minahil's written go-ahead and real merchant accounts; keep sandbox`);
  return out;
}
