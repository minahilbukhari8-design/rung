import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EasypaisaGateway, JazzCashGateway, easypaisaHash, jazzcashHash } from '../src/adapters/wallets.js';
import { api, login, pktDate, prisma, setup, type Ctx } from './helpers.js';

const SALT = 'testsalt123';
const JC = { merchantId: 'MC123', password: 'pw', integritySalt: SALT, postUrl: 'https://jazzcash.invalid/form', sandbox: true };
let ctx: Ctx;
let customer: string;
let day = 2;
/** what the stubbed Easypaisa inquiry API answers, by order reference */
const easypaisaLedger = new Map<string, { transactionStatus: string; transactionAmount: string }>();

beforeAll(async () => {
  process.env.PUBLIC_API_URL = 'https://api.rung.test';
  process.env.WEB_PUBLIC_URL = 'https://rung.test';
  process.env.APP_RETURN_ORIGINS = 'exp://';
  ctx = await setup();
  ctx.adapters.payments.JAZZCASH = new JazzCashGateway(JC);
  ctx.adapters.payments.EASYPAISA = new EasypaisaGateway(
    { storeId: '1234', hashKey: '0123456789abcdef', indexUrl: 'https://easypaisa.invalid/Index.jsf', confirmUrl: 'https://easypaisa.invalid/Confirm.jsf', inquiryUrl: 'https://easypaisa.invalid/inquire', username: 'u', password: 'p', accountNum: '1', sandbox: true },
    async (_url, init) => {
      const { orderId } = JSON.parse(init.body) as { orderId: string };
      const e = easypaisaLedger.get(orderId);
      return { ok: true, json: async () => (e ? { responseCode: '0000', ...e, transactionId: `EP-${orderId}` } : { responseCode: '0001', transactionStatus: 'NOT_FOUND' }) };
    },
  );
  const { buildApp } = await import('../src/app.js');
  await ctx.app.close();
  ctx.app = await buildApp(ctx.adapters);
  customer = await login(ctx, '03501112222');
});
afterAll(async () => {
  await ctx.app.close();
});

async function checkout(provider: 'JAZZCASH' | 'EASYPAISA', extra: Record<string, unknown> = {}) {
  const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' }, include: { variants: true } });
  const v = p.variants.find((x) => x.name === '1 lb')!;
  const addr = (await api(ctx, customer).post('/me/addresses', { recipientName: 'A', recipientPhone: '03212223334', line1: 'House 1 Road', area: 'DHA' })).json();
  await api(ctx, customer).post('/cart/items', { variantId: v.id, quantity: 1 });
  const r = await api(ctx, customer).post('/checkout', { provider, idempotencyKey: `pay-test-${provider}-${day}`, senderName: 'S', groups: [{ vendorId: p.vendorId, addressId: addr.id, date: pktDate(day++), slotStartMinute: 900 }], ...extra });
  expect(r.statusCode).toBe(201);
  return r.json() as { orders: string[]; payment: { id: string; status: string; redirectUrl: string } };
}

/** Opens the signed start link like a browser and returns the form our page posts to the gateway. */
async function startForm(redirectUrl: string) {
  const res = await ctx.app.inject({ method: 'GET', url: redirectUrl.replace('https://api.rung.test', '') });
  expect(res.statusCode).toBe(200);
  const fields = Object.fromEntries([...res.body.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]!.replace(/&amp;/g, '&')]));
  const action = res.body.match(/action="([^"]+)"/)![1];
  return { action, fields };
}

/** What JazzCash would post back, signed with the salt. */
function jazzcashReply(req: Record<string, string>, code: string, over: Record<string, string> = {}) {
  const r: Record<string, string> = { pp_Version: '1.1', pp_TxnType: 'MWALLET', pp_MerchantID: req.pp_MerchantID!, pp_TxnRefNo: req.pp_TxnRefNo!, pp_Amount: req.pp_Amount!, pp_TxnCurrency: 'PKR', pp_ResponseCode: code, pp_ResponseMessage: code === '000' ? 'ok' : 'declined', pp_RetreivalReferenceNo: code === '000' ? '261115000001' : '', pp_BillReference: req.pp_BillReference!, ...over };
  r.pp_SecureHash = jazzcashHash(r, SALT);
  return r;
}
const postForm = (url: string, fields: Record<string, string>) =>
  ctx.app.inject({ method: 'POST', url, headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(fields).toString() });
const orderStatus = async (n: string) => (await prisma.order.findUniqueOrThrow({ where: { number: n } })).status;

describe('signing (vectors computed independently with Python hmac and OpenSSL)', () => {
  it('JazzCash pp_SecureHash: salt-prefixed, sorted non-empty values, HMAC-SHA256, upper-case hex', () => {
    const f = { pp_Amount: '150000', pp_BillReference: 'T1', pp_Description: 'RUNG order RG-ABC', pp_Language: 'EN', pp_MerchantID: 'MC123', pp_Password: 'pw', pp_ReturnURL: 'https://x/cb', pp_TxnCurrency: 'PKR', pp_TxnDateTime: '20261115120000', pp_TxnExpiryDateTime: '20261115130000', pp_TxnRefNo: 'T1', pp_TxnType: 'MWALLET', pp_Version: '1.1', pp_BankID: '', ppmpf_1: '' };
    expect(jazzcashHash(f, 'testsalt123')).toBe('9E34C4E7B3534500E88D31919DAD67C3F8D49569B978FAC8249597642C3CBDAC');
    expect(jazzcashHash({ ...f, pp_SecureHash: 'ignored' }, 'testsalt123')).toBe('9E34C4E7B3534500E88D31919DAD67C3F8D49569B978FAC8249597642C3CBDAC');
  });
  it('Easypaisa merchantHashedReq: sorted key=value pairs, AES-128-ECB, base64', () => {
    const f = { storeId: '1234', amount: '1500.0', postBackURL: 'https://x/cb', orderRefNum: 'E1', expiryDate: '20261115 130000', autoRedirect: '1' };
    expect(easypaisaHash(f, '0123456789abcdef')).toBe('IqavFm7tOzFI9wpsLelCp9MiclKVEfyHrYd4voCPmj4UmlkERXan/inStN30kMGxxjDD4Z+FCKykXtGxmEptFlnOMardo9z50MynI2UEjN0JrD0YPOtjg9XW6G9/HHxa3KeB73g8qfFq769rKlPX6g==');
  });
});

describe('JazzCash flow', () => {
  it('only offers wallets that are configured', async () => {
    const methods = (await api(ctx).get('/payments/methods')).json();
    expect(methods.map((m: { provider: string }) => m.provider).sort()).toEqual(['BANK_TRANSFER', 'COD', 'EASYPAISA', 'JAZZCASH', 'MOCK']);
  });

  it('checkout → signed form → signed success callback places the order, once', async () => {
    const co = await checkout('JAZZCASH');
    expect(co.payment.status).toBe('PENDING');
    expect(await orderStatus(co.orders[0]!)).toBe('PENDING_PAYMENT');
    const { action, fields } = await startForm(co.payment.redirectUrl);
    expect(action).toBe(JC.postUrl);
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } });
    expect(fields).toMatchObject({ pp_MerchantID: 'MC123', pp_Amount: String(pay.amountPaisa), pp_TxnCurrency: 'PKR', pp_TxnRefNo: pay.providerRef, pp_ReturnURL: 'https://api.rung.test/api/v1/payments/callback/jazzcash' });
    expect(fields.pp_SecureHash).toBe(jazzcashHash(fields, SALT));

    const cb = await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000'));
    expect(cb.statusCode).toBe(303);
    expect(cb.headers.location).toBe(`https://rung.test/payment/result?payment=${co.payment.id}`);
    expect(await orderStatus(co.orders[0]!)).toBe('PLACED');
    const after = await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } });
    expect(after).toMatchObject({ status: 'SUCCEEDED', providerRef: '261115000001' });
    expect((after.rawResponse as { gateway: { pp_ResponseCode: string } }).gateway.pp_ResponseCode).toBe('000');

    // customer sees it
    expect((await api(ctx, customer).get(`/payments/${co.payment.id}`)).json()).toMatchObject({ status: 'SUCCEEDED', orderGroup: { orders: [{ number: co.orders[0], status: 'PLACED' }] } });
    // replaying the callback changes nothing
    const replay = await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000'));
    expect([303, 404]).toContain(replay.statusCode);
    expect(await prisma.orderStatusEvent.count({ where: { order: { number: co.orders[0] }, to: 'PLACED' } })).toBe(1);
  });

  it('rejects a callback with a forged or tampered signature', async () => {
    const co = await checkout('JAZZCASH');
    const { fields } = await startForm(co.payment.redirectUrl);
    const good = jazzcashReply(fields, '000');
    const tampered = { ...good, pp_ResponseCode: '000', pp_Amount: '1' }; // hash no longer matches
    expect((await postForm('/api/v1/payments/callback/jazzcash', tampered)).statusCode).toBe(400);
    expect((await postForm('/api/v1/payments/callback/jazzcash', { ...good, pp_SecureHash: 'A'.repeat(64) })).statusCode).toBe(400);
    const { pp_SecureHash: _drop, ...unsigned } = good;
    expect((await postForm('/api/v1/payments/callback/jazzcash', unsigned)).statusCode).toBe(400);
    expect(await orderStatus(co.orders[0]!)).toBe('PENDING_PAYMENT');
    expect(await prisma.auditLog.count({ where: { action: 'payment.bad_callback' } })).toBeGreaterThanOrEqual(3);
  });

  it('a correctly signed reply for the wrong amount does not place the order', async () => {
    const co = await checkout('JAZZCASH');
    const { fields } = await startForm(co.payment.redirectUrl);
    await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000', { pp_Amount: '100' }));
    expect(await orderStatus(co.orders[0]!)).toBe('PENDING_PAYMENT');
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } });
    expect(p.status).toBe('PENDING');
    expect(p.failureReason).toMatch(/Amount mismatch/);
    // finance sees it in the queue
    expect(await prisma.auditLog.count({ where: { action: 'payment.amount_mismatch', entityId: co.payment.id } })).toBe(1);
  });

  it('a declined payment cancels the order and returns stock; a voucher reply keeps it pending', async () => {
    const v = await prisma.productVariant.findFirstOrThrow({ where: { name: '1 lb', product: { slug: 'demo-chocolate-cake' } } });
    const co = await checkout('JAZZCASH');
    const stock = (await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock;
    const { fields } = await startForm(co.payment.redirectUrl);
    await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '124'));
    expect(await orderStatus(co.orders[0]!)).toBe('PENDING_PAYMENT');
    await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '199'));
    expect(await orderStatus(co.orders[0]!)).toBe('CANCELLED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(stock + 1);
  });

  it('money arriving after an order was cancelled goes to finance as a refund request', async () => {
    const co = await checkout('JAZZCASH');
    const { fields } = await startForm(co.payment.redirectUrl);
    await api(ctx, customer).post(`/orders/${co.orders[0]}/cancel`, {});
    await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000'));
    const r = await prisma.refund.findFirstOrThrow({ where: { paymentId: co.payment.id } });
    expect(r).toMatchObject({ status: 'REQUESTED', amountPaisa: (await prisma.order.findUniqueOrThrow({ where: { number: co.orders[0] } })).totalPaisa });
  });

  it('start links are signed and expire; the app can only return to its own scheme', async () => {
    const co = await checkout('JAZZCASH', { client: 'app', returnTo: 'rung://payment-result' });
    const forged = co.payment.redirectUrl.replace(/t=[^&]+/, 't=' + 'x'.repeat(43));
    expect((await ctx.app.inject({ method: 'GET', url: forged.replace('https://api.rung.test', '') })).statusCode).toBe(403);
    const expired = co.payment.redirectUrl.replace(/exp=\d+/, 'exp=1000');
    expect((await ctx.app.inject({ method: 'GET', url: expired.replace('https://api.rung.test', '') })).statusCode).toBe(403);
    const { fields } = await startForm(co.payment.redirectUrl);
    const cb = await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000'));
    expect(cb.headers.location).toBe(`rung://payment-result?payment=${co.payment.id}`);

    const evil = await checkout('JAZZCASH', { client: 'app', returnTo: 'https://evil.example/steal' });
    const f2 = (await startForm(evil.payment.redirectUrl)).fields;
    expect((await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(f2, '000'))).headers.location).toBe(`https://rung.test/payment/result?payment=${evil.payment.id}`);
  });

  it('pays a booking advance with JazzCash and confirms the booking', async () => {
    const decor = await login(ctx, '03000000102');
    const pkg = await prisma.servicePackage.findFirstOrThrow({ where: { name: 'DEMO Basic' } });
    const b = (await api(ctx, customer).post('/bookings', { packageId: pkg.id, eventStart: `${pktDate(30)}T19:00:00+05:00`, venue: { address: 'Hall 1, Main Road', area: 'Gulberg III' } })).json();
    await api(ctx, decor).post(`/vendor/bookings/${b.number}/transition`, { to: 'ACCEPTED' });
    const pay = (await api(ctx, customer).post(`/bookings/${b.number}/pay`, { stage: 'advance', provider: 'JAZZCASH', idempotencyKey: `adv-${b.number}` })).json();
    expect(pay.redirectUrl).toContain('/go?');
    const { fields } = await startForm(pay.redirectUrl);
    expect(fields.pp_Amount).toBe(String(b.advancePaisa));
    await postForm('/api/v1/payments/callback/jazzcash', jazzcashReply(fields, '000'));
    expect(await prisma.booking.findUniqueOrThrow({ where: { number: b.number } })).toMatchObject({ status: 'CONFIRMED', paidPaisa: b.advancePaisa });
  });
});

describe('Easypaisa flow', () => {
  it('two browser hops, then the result comes from the inquiry API, not from the unsigned return', async () => {
    const co = await checkout('EASYPAISA');
    const { action, fields } = await startForm(co.payment.redirectUrl);
    expect(action).toBe('https://easypaisa.invalid/Index.jsf');
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } });
    expect(fields).toMatchObject({ storeId: '1234', amount: (pay.amountPaisa / 100).toFixed(1), orderRefNum: pay.providerRef, autoRedirect: '1' });
    expect(fields.merchantHashedReq).toBe(easypaisaHash(fields, '0123456789abcdef'));

    // hop 1: auth_token → our page posts to Confirm.jsf
    const hop1 = await ctx.app.inject({ method: 'GET', url: `/api/v1/payments/callback/easypaisa?auth_token=tok123&orderRefNum=${pay.providerRef}` });
    expect(hop1.body).toContain('action="https://easypaisa.invalid/Confirm.jsf"');
    expect(hop1.body).toContain('name="auth_token" value="tok123"');

    // hop 2 claims success, but the inquiry API has no payment: must NOT place the order
    const lie = await ctx.app.inject({ method: 'GET', url: `/api/v1/payments/callback/easypaisa?status=0000&orderRefNumber=${pay.providerRef}` });
    expect(lie.statusCode).toBe(303);
    expect(await orderStatus(co.orders[0]!)).toBe('CANCELLED');
  });

  it('places the order when the inquiry API confirms the payment and amount', async () => {
    const co = await checkout('EASYPAISA');
    const pay = await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } });
    easypaisaLedger.set(pay.providerRef!, { transactionStatus: 'PAID', transactionAmount: (pay.amountPaisa / 100).toFixed(1) });
    await ctx.app.inject({ method: 'GET', url: `/api/v1/payments/callback/easypaisa?status=0000&orderRefNumber=${pay.providerRef}` });
    expect(await orderStatus(co.orders[0]!)).toBe('PLACED');
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } })).providerRef).toBe(`EP-${pay.providerRef}`);
  });
});

describe('finance', () => {
  it('wallet payments waiting on review show in the admin queue', async () => {
    const admin = await login(ctx, '03509990000');
    await prisma.user.update({ where: { phone: '+923509990000' }, data: { roles: ['CUSTOMER', 'ADMIN'], adminPermissions: ['FINANCE'] } });
    const list = (await api(ctx, admin).get('/admin/payments?status=PENDING')).json();
    expect(list.some((p: { failureReason?: string }) => p.failureReason?.startsWith('Amount mismatch'))).toBe(true);
  });
});
