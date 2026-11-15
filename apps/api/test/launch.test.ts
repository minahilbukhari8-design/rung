import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbStorage } from '../src/adapters/index.js';
import { productionProblems } from '../src/lib/config.js';
import { previewLogins } from '../src/routes/auth.js';
import { api, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  process.env.PREVIEW_TEST_LOGINS = '03009876543:482913';
  process.env.JOBS_TOKEN = 'jobs-token-for-tests-0123456789';
  ctx = await setup();
  ctx.adapters.storage = new DbStorage(prisma);
  const { buildApp } = await import('../src/app.js');
  await ctx.app.close();
  ctx.app = await buildApp(ctx.adapters);
});
afterAll(async () => {
  delete process.env.PREVIEW_TEST_LOGINS;
  await ctx.app.close();
});

const goodProd = { NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATABASE_URL: 'postgresql://u:p@ep-abc.neon.tech/rung', PUBLIC_API_URL: 'https://rung-api.onrender.com', WEB_PUBLIC_URL: 'https://rung.vercel.app', FILE_STORAGE: 'db' };

describe('launch readiness', () => {
  it('production refuses laptop-only settings', () => {
    expect(productionProblems({})).toEqual([]);
    expect(productionProblems(goodProd)).toEqual([]);
    const bad = productionProblems({ NODE_ENV: 'production', JWT_SECRET: 'change-me-local-dev-only', DATABASE_URL: 'postgresql://rung:rung_local_dev@localhost:5432/rung', PUBLIC_API_URL: 'http://localhost:4000', PAYMENT_SIMULATOR: '1', MOCK_SMS_OUTBOX_FILE: '/tmp/x', JOBS_TOKEN: 'short', JAZZCASH_MODE: 'live' });
    expect(bad.join('\n')).toMatch(/JWT_SECRET/);
    expect(bad.join('\n')).toMatch(/DATABASE_URL/);
    expect(bad.join('\n')).toMatch(/PUBLIC_API_URL/);
    expect(bad.join('\n')).toMatch(/WEB_PUBLIC_URL/);
    expect(bad.join('\n')).toMatch(/PAYMENT_SIMULATOR/);
    expect(bad.join('\n')).toMatch(/MOCK_SMS_OUTBOX_FILE/);
    expect(bad.join('\n')).toMatch(/FILE_STORAGE/);
    expect(bad.join('\n')).toMatch(/JOBS_TOKEN/);
    expect(bad.join('\n')).toMatch(/JAZZCASH_MODE/);
  });

  it('preview test logins: fixed code for listed phones only, no SMS sent, off when real SMS is on', async () => {
    expect(previewLogins({ PREVIEW_TEST_LOGINS: '0300 9876543:482913', OTP_PROVIDER: 'mock' }).get('+923009876543')).toBe('482913');
    expect(previewLogins({ PREVIEW_TEST_LOGINS: '03009876543:482913', OTP_PROVIDER: 'twilio' }).size).toBe(0);
    expect(() => previewLogins({ PREVIEW_TEST_LOGINS: '03009876543:123456' })).toThrow(/guessable/);
    expect(() => previewLogins({ PREVIEW_TEST_LOGINS: '03009876543:111111' })).toThrow(/guessable/);
    expect(() => previewLogins({ PREVIEW_TEST_LOGINS: 'abc:482913' })).toThrow(/bad entry/);

    const before = ctx.sms.outbox.length;
    await api(ctx).post('/auth/otp/request', { phone: '03009876543' });
    expect(ctx.sms.outbox.length).toBe(before);
    const ok = await api(ctx).post('/auth/otp/verify', { phone: '03009876543', code: '482913' });
    expect(ok.statusCode).toBe(200);
    // a phone that is not listed still gets a random code by SMS
    await api(ctx).post('/auth/otp/request', { phone: '03009876544' });
    expect(ctx.sms.lastTo('+923009876544')).toBeTruthy();
    expect((await api(ctx).post('/auth/otp/verify', { phone: '03009876544', code: '482913' })).statusCode).toBe(400);
  });

  it('files stored in the database survive and come back byte for byte', async () => {
    const s = new DbStorage(prisma);
    const bytes = Buffer.from([0, 1, 2, 250, 255, 37, 80, 68, 70]);
    await s.put('kyc/test/a.pdf', bytes, 'application/pdf');
    const back = await s.get('kyc/test/a.pdf');
    expect(back?.contentType).toBe('application/pdf');
    expect(Buffer.compare(back!.data, bytes)).toBe(0);
    expect(await s.get('nope')).toBeNull();
  });

  it('scheduled jobs run only with the right token', async () => {
    const run = (token?: string) => ctx.app.inject({ method: 'POST', url: '/api/v1/jobs/run', headers: token ? { 'x-jobs-token': token } : {} });
    expect((await run()).statusCode).toBe(401);
    expect((await run('jobs-token-for-tests-012345678X')).statusCode).toBe(401);
    const ok = await run('jobs-token-for-tests-0123456789');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ordersRejected: expect.any(Number), bookingsExpired: expect.any(Number) });
  });

  it('API responses carry basic security headers', async () => {
    const r = await api(ctx).get('/occasions');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
  });
});
