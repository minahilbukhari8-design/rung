import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, login, pktDate, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let token: string;
let variantId: string;
let vendorId: string;
let addressId: string;
let vendorToken: string;
let messageOptionId: string;

beforeAll(async () => {
  ctx = await setup();
  token = await login(ctx, '03111111111');
  vendorToken = await login(ctx, '03000000101'); // DEMO bakery owner
  const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' }, include: { variants: true, customizations: true } });
  variantId = p.variants.find((v) => v.name === '2 lb')!.id;
  vendorId = p.vendorId;
  messageOptionId = p.customizations[0]!.id;
  const a = await api(ctx, token).post('/me/addresses', { recipientName: 'Ammi', recipientPhone: '03222222222', line1: 'House 1, Street 2', area: 'Gulberg III' });
  expect(a.statusCode).toBe(201);
  expect(a.json().zoneId).toBeTruthy(); // matched to Gulberg zone
  addressId = a.json().id;
});
afterAll(async () => {
  await ctx.app.close();
});
beforeEach(async () => {
  await prisma.cartItem.deleteMany({});
});

const stock = async () => (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stock;
const checkoutBody = (provider: string, key: string, slot = 900, day = 3) => ({
  provider, idempotencyKey: key, senderName: 'Bilal',
  groups: [{ vendorId, addressId, date: pktDate(day), slotStartMinute: slot, giftMessage: 'Happy birthday Ammi!' }],
});

describe('cart and checkout', () => {
  it('quotes and places a prepaid (mock) order, reserving stock', async () => {
    const before = await stock();
    const add = await api(ctx, token).post('/cart/items', { variantId, quantity: 2, customization: { [messageOptionId]: 'Ammi 60' } });
    expect(add.statusCode).toBe(201);
    const q = await api(ctx, token).post('/checkout/quote', { groups: checkoutBody('MOCK', 'x').groups });
    expect(q.statusCode).toBe(200);
    expect(q.json().grandTotalPaisa).toBe(400_000);

    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0001'));
    expect(r.statusCode).toBe(201);
    expect(r.json().payment).toMatchObject({ status: 'SUCCEEDED', isSandbox: true });
    const order = await prisma.order.findUniqueOrThrow({ where: { number: r.json().orders[0] }, include: { items: true } });
    expect(order.status).toBe('PLACED');
    expect(order.recipientName).toBe('Ammi');
    expect(order.items[0]!.customization).toEqual({ [messageOptionId]: 'Ammi 60' });
    expect(order.commissionPaisa).toBe(48_000); // 12% of 400,000
    expect(await stock()).toBe(before - 2);
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it('replays the same response for a repeated idempotency key', async () => {
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    const a = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0002'));
    const b = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0002'));
    expect(b.json().idempotentReplay).toBe(true);
    expect(b.json().orders).toEqual(a.json().orders);
  });

  it('rejects text customization over the vendor limit', async () => {
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1, customization: { [messageOptionId]: 'x'.repeat(31) } });
    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0003'));
    expect(r.json().error.code).toBe('CUSTOMIZATION_TOO_LONG');
  });

  it('caps cash on delivery at Rs 5,000 for a first order', async () => {
    await api(ctx, token).post('/cart/items', { variantId, quantity: 3 }); // Rs 6,000
    const r = await api(ctx, token).post('/checkout', checkoutBody('COD', 'checkout-key-0004'));
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('COD_LIMIT');
  });

  it('places COD orders straight to PLACED with payment pending', async () => {
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    const r = await api(ctx, token).post('/checkout', checkoutBody('COD', 'checkout-key-0005'));
    expect(r.statusCode).toBe(201);
    expect(r.json().payment.status).toBe('PENDING');
    expect((await prisma.order.findUniqueOrThrow({ where: { number: r.json().orders[0] } })).status).toBe('PLACED');
  });

  it('cancels orders and restores stock when the payment fails', async () => {
    const before = await stock();
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    ctx.mock.failNext = true;
    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0006'));
    expect(r.json().payment.status).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { number: r.json().orders[0] } })).status).toBe('CANCELLED');
    expect(await stock()).toBe(before);
  });

  it('refuses checkout when stock is not enough', async () => {
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 1 } });
    await api(ctx, token).post('/cart/items', { variantId, quantity: 2 });
    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0007'));
    expect(r.json().error.code).toBe('OUT_OF_STOCK');
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 50 } });
  });

  it('enforces slot capacity', async () => {
    await prisma.vendorDeliverySlot.updateMany({ where: { vendorId, startMinute: 720 }, data: { capacity: 1 } });
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    expect((await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0008', 720, 5))).statusCode).toBe(201);
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0009', 720, 5));
    expect(r.json().error.code).toBe('SLOT_UNAVAILABLE');
  });

  it('only allows one concurrent checkout to take the last unit', async () => {
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 1 } });
    const other = await login(ctx, '03133333333');
    const a2 = (await api(ctx, other).post('/me/addresses', { recipientName: 'X', recipientPhone: '03222222223', line1: 'House 9 Road', area: 'Gulberg' })).json().id;
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    await api(ctx, other).post('/cart/items', { variantId, quantity: 1 });
    const body2 = { ...checkoutBody('MOCK', 'checkout-key-0011'), groups: [{ ...checkoutBody('MOCK', 'x').groups[0], addressId: a2 }] };
    const [r1, r2] = await Promise.all([api(ctx, token).post('/checkout', checkoutBody('MOCK', 'checkout-key-0010')), api(ctx, other).post('/checkout', body2)]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([201, 409]);
    expect(await stock()).toBe(0);
    await prisma.productVariant.update({ where: { id: variantId }, data: { stock: 50 } });
  });
});

describe('order lifecycle', () => {
  let day = 6; // a fresh date per order so slot capacity (5) never interferes
  async function placeOrder(key: string) {
    await api(ctx, token).post('/cart/items', { variantId, quantity: 1 });
    const r = await api(ctx, token).post('/checkout', checkoutBody('MOCK', key, 900, day++));
    expect(r.statusCode, r.body).toBe(201);
    return r.json().orders[0] as string;
  }

  it('vendor moves an order to delivered, which needs a photo', async () => {
    const n = await placeOrder('life-key-0001');
    const v = api(ctx, vendorToken);
    for (const to of ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY']) expect((await v.post(`/vendor/orders/${n}/transition`, { to })).statusCode).toBe(200);
    const noPhoto = await v.post(`/vendor/orders/${n}/transition`, { to: 'DELIVERED' });
    expect(noPhoto.statusCode).toBe(409);
    const ok = await v.post(`/vendor/orders/${n}/transition`, { to: 'DELIVERED', photoUrl: 'https://example.com/proof.jpg' });
    expect(ok.json().status).toBe('DELIVERED');
    expect(ok.json().events.map((e: { to: string }) => e.to)).toEqual(['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED']);
  });

  it('customer can cancel before acceptance and is refunded in full', async () => {
    const before = await stock();
    const n = await placeOrder('life-key-0002');
    const r = await api(ctx, token).post(`/orders/${n}/cancel`, { reason: 'Changed plan' });
    expect(r.json().status).toBe('CANCELLED');
    expect(r.json().refunds[0]).toMatchObject({ amountPaisa: 200_000, status: 'PROCESSED' });
    expect(await stock()).toBe(before);
  });

  it('customer cannot accept their own order or touch another vendor’s order', async () => {
    const n = await placeOrder('life-key-0003');
    expect((await api(ctx, token).post(`/vendor/orders/${n}/transition`, { to: 'ACCEPTED' })).statusCode).toBe(403);
    const decorOwner = await login(ctx, '03000000102');
    expect((await api(ctx, decorOwner).post(`/vendor/orders/${n}/transition`, { to: 'ACCEPTED' })).statusCode).toBe(404);
  });

  it('auto-rejects orders the vendor ignores past the SLA and refunds', async () => {
    const n = await placeOrder('life-key-0004');
    await prisma.order.update({ where: { number: n }, data: { vendorRespondBy: new Date(Date.now() - 1000) } });
    await prisma.user.update({ where: { phone: '+923111111111' }, data: { roles: ['CUSTOMER', 'ADMIN'] } });
    const r = await api(ctx, token).post('/admin/jobs/expire');
    expect(r.json().ordersRejected).toBeGreaterThanOrEqual(1);
    const o = await prisma.order.findUniqueOrThrow({ where: { number: n }, include: { refunds: true } });
    expect(o.status).toBe('REJECTED');
    expect(o.refunds[0]!.status).toBe('PROCESSED');
    await prisma.user.update({ where: { phone: '+923111111111' }, data: { roles: ['CUSTOMER'] } });
  });
});
