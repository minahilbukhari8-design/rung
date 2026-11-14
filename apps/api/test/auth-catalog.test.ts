import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, login, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
beforeAll(async () => {
  ctx = await setup();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('phone OTP auth', () => {
  it('logs in with a Pakistani number in any format and returns tokens', async () => {
    const r = await api(ctx).post('/auth/otp/request', { phone: '0300 111 2233' });
    expect(r.statusCode).toBe(200);
    expect(r.json().phone).toBe('+923001112233');
    const sms = ctx.sms.lastTo('+923001112233')!;
    expect(sms.text).toMatch(/RUNG code: \d{6}/);
    const code = sms.text.match(/(\d{6})/)![1];
    const v = await api(ctx).post('/auth/otp/verify', { phone: '+92 300 1112233', code });
    expect(v.statusCode).toBe(200);
    const body = v.json();
    expect(body.user.roles).toEqual(['CUSTOMER']);
    const me = await api(ctx, body.accessToken).get('/me');
    expect(me.json().phone).toBe('+923001112233');
    // OTP is stored hashed, never in plain text
    const row = await prisma.otpCode.findFirst({ where: { phone: '+923001112233' } });
    expect(row!.codeHash).not.toContain(code);
  });

  it('rejects non-Pakistani / landline numbers', async () => {
    const r = await api(ctx).post('/auth/otp/request', { phone: '042 35761234' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a wrong code and locks after 5 attempts', async () => {
    await api(ctx).post('/auth/otp/request', { phone: '03002223344' });
    for (let i = 0; i < 5; i++) {
      const r = await api(ctx).post('/auth/otp/verify', { phone: '03002223344', code: '000000' === ctx.sms.lastTo('+923002223344')!.text.match(/(\d{6})/)![1] ? '111111' : '000000' });
      expect(r.json().error.code).toBe('OTP_INVALID');
    }
    const code = ctx.sms.lastTo('+923002223344')!.text.match(/(\d{6})/)![1];
    const locked = await api(ctx).post('/auth/otp/verify', { phone: '03002223344', code });
    expect(locked.statusCode).toBe(429);
  });

  it('rate-limits OTP sends to 3 per 15 minutes per number', async () => {
    const codes = [];
    for (let i = 0; i < 4; i++) codes.push((await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/otp/request', payload: { phone: '03004445566' }, remoteAddress: `10.9.9.${i}` })).statusCode);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it('rotates refresh tokens (old one stops working)', async () => {
    await api(ctx).post('/auth/otp/request', { phone: '03005556677' });
    const code = ctx.sms.lastTo('+923005556677')!.text.match(/(\d{6})/)![1];
    const { refreshToken } = (await api(ctx).post('/auth/otp/verify', { phone: '03005556677', code })).json();
    const r1 = await api(ctx).post('/auth/refresh', { refreshToken });
    expect(r1.statusCode).toBe(200);
    const r2 = await api(ctx).post('/auth/refresh', { refreshToken });
    expect(r2.statusCode).toBe(401);
  });

  it('requires login for /me and rejects bad tokens', async () => {
    expect((await api(ctx).get('/me')).statusCode).toBe(401);
    expect((await api(ctx, 'not-a-token').get('/me')).statusCode).toBe(401);
  });
});

describe('catalogue', () => {
  it('lists occasions with Urdu names', async () => {
    const r = await api(ctx).get('/occasions');
    const birthday = r.json().find((o: { slug: string }) => o.slug === 'birthday');
    expect(birthday.nameUr).toBe('سالگرہ');
  });

  it('filters products by occasion and marks demo vendors', async () => {
    const r = await api(ctx).get('/products?occasion=birthday');
    expect(r.json().items).toHaveLength(1);
    expect(r.json().items[0].vendor.isDemo).toBe(true);
    expect(r.json().items[0].fromPricePaisa).toBe(100_000);
    expect((await api(ctx).get('/products?occasion=eid')).json().items).toHaveLength(0);
  });

  it('search understands Roman Urdu spelling variants', async () => {
    const r = await api(ctx).get('/search?q=mehendi');
    expect(r.json().services.map((s: { slug: string }) => s.slug)).toContain('demo-mehndi-decor');
  });

  it('shows delivery slots respecting lead time and zone', async () => {
    const product = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' } });
    const zone = await prisma.deliveryZone.findFirstOrThrow({ where: { name: 'Gulberg' } });
    const d = new Date(Date.now() + 5 * 3600_000 + 2 * 86_400_000).toISOString().slice(0, 10);
    const r = await api(ctx).get(`/products/${product.id}/delivery-slots?zone=${zone.id}&date=${d}`);
    expect(r.json().slots.map((s: { startMinute: number }) => s.startMinute)).toEqual([720, 900, 1080]);
  });

  it('hides vendors that are not approved', async () => {
    await prisma.vendor.update({ where: { slug: 'demo-bakery' }, data: { status: 'SUSPENDED' } });
    expect((await api(ctx).get('/products')).json().items).toHaveLength(0);
    expect((await api(ctx).get('/vendors/demo-bakery')).statusCode).toBe(404);
    await prisma.vendor.update({ where: { slug: 'demo-bakery' }, data: { status: 'APPROVED' } });
  });

  it('logs a returning user into the same account', async () => {
    const t1 = await login(ctx, '03007778899');
    const t2 = await login(ctx, '+923007778899');
    const a = (await api(ctx, t1).get('/me')).json().id;
    const b = (await api(ctx, t2).get('/me')).json().id;
    expect(a).toBe(b);
  });
});
