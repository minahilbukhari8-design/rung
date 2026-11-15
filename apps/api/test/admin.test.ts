import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, login, pktDate, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let superAdmin: string;
let opsAdmin: string;
let customer: string;
let owner: string;
let day = 2;

async function makeAdmin(phone: string, perms: ('OPS' | 'FINANCE' | 'SUPPORT' | 'SUPERADMIN')[]) {
  const token = await login(ctx, phone);
  await prisma.user.update({ where: { phone: `+92${phone.slice(1)}` }, data: { roles: ['CUSTOMER', 'ADMIN'], adminPermissions: perms } });
  return token;
}

async function order(provider: 'MOCK' | 'BANK_TRANSFER' | 'COD') {
  const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' }, include: { variants: true } });
  const v = p.variants.find((x) => x.name === '1 lb')!;
  const addr = (await api(ctx, customer).post('/me/addresses', { recipientName: 'A', recipientPhone: '03212223334', line1: 'House 1 Road', area: 'DHA' })).json();
  await api(ctx, customer).post('/cart/items', { variantId: v.id, quantity: 1 });
  const r = await api(ctx, customer).post('/checkout', { provider, idempotencyKey: `admin-test-${provider}-${day}`, senderName: 'S', groups: [{ vendorId: p.vendorId, addressId: addr.id, date: pktDate(day++), slotStartMinute: 900 }] });
  expect(r.statusCode).toBe(201);
  return r.json() as { orders: string[]; payment: { id: string; status: string } };
}

beforeAll(async () => {
  ctx = await setup();
  superAdmin = await makeAdmin('03400000001', ['SUPERADMIN']);
  opsAdmin = await makeAdmin('03400000002', ['OPS']);
  customer = await login(ctx, '03401112222');
  owner = await login(ctx, '03000000101'); // DEMO bakery owner
});
afterAll(async () => {
  await ctx.app.close();
});

describe('admin permissions', () => {
  it('blocks non-admins and limits admins to their area', async () => {
    expect((await api(ctx, customer).get('/admin/overview')).statusCode).toBe(403);
    expect((await api(ctx, opsAdmin).get('/admin/overview')).statusCode).toBe(200);
    expect((await api(ctx, opsAdmin).get('/admin/documents')).statusCode).toBe(200);
    expect((await api(ctx, opsAdmin).get('/admin/payments')).statusCode).toBe(403);
    expect((await api(ctx, opsAdmin).get('/admin/users')).statusCode).toBe(403);
    expect((await api(ctx, superAdmin).get('/admin/me')).json().permissions).toEqual(['SUPERADMIN']);
  });
});

describe('vendor KYC', () => {
  it('accepting both CNIC sides marks the vendor verified; rejecting needs a reason', async () => {
    const vendor = await prisma.vendor.findFirstOrThrow({ where: { slug: 'demo-bakery' } });
    await prisma.vendor.update({ where: { id: vendor.id }, data: { isVerified: false } });
    const docs = await Promise.all(['CNIC_FRONT', 'CNIC_BACK'].map((type) => prisma.vendorDocument.create({ data: { vendorId: vendor.id, type: type as 'CNIC_FRONT', storageKey: `private/x/${type}.pdf` } })));
    const queue = (await api(ctx, opsAdmin).get('/admin/documents')).json();
    expect(queue.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining(docs.map((d) => d.id)));
    expect((await api(ctx, opsAdmin).post(`/admin/documents/${docs[0]!.id}/review`, { status: 'REJECTED' })).json().error.code).toBe('REASON_REQUIRED');
    await api(ctx, opsAdmin).post(`/admin/documents/${docs[0]!.id}/review`, { status: 'ACCEPTED' });
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).isVerified).toBe(false);
    await api(ctx, opsAdmin).post(`/admin/documents/${docs[1]!.id}/review`, { status: 'ACCEPTED' });
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).isVerified).toBe(true);
    const detail = (await api(ctx, opsAdmin).get(`/admin/vendors/${vendor.id}`)).json();
    expect(detail.payoutAccountEncrypted).toBeUndefined();
    expect(detail.members[0].user.phone).toBe('+923000000101');
    const log = (await api(ctx, opsAdmin).get(`/admin/audit-log?entity=VendorDocument&entityId=${docs[1]!.id}`)).json();
    expect(log[0].action).toBe('document.accepted');
  });
});

describe('bank transfers and manual refunds', () => {
  it('confirming a transfer places the order; cancelling leaves a refund for finance to send by hand', async () => {
    const co = await order('BANK_TRANSFER');
    expect(co.payment.status).toBe('PENDING');
    const number = co.orders[0]!;
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('PENDING_PAYMENT');

    const pending = (await api(ctx, superAdmin).get('/admin/payments')).json();
    expect(pending.some((p: { id: string }) => p.id === co.payment.id)).toBe(true);
    expect((await api(ctx, superAdmin).post(`/admin/payments/${co.payment.id}/confirm`, {})).json().error.code).toBe('REFERENCE_REQUIRED');
    const ok = await api(ctx, superAdmin).post(`/admin/payments/${co.payment.id}/confirm`, { reference: 'TEST-REF-1' });
    expect(ok.json().status).toBe('SUCCEEDED');
    expect((await prisma.order.findUniqueOrThrow({ where: { number } })).status).toBe('PLACED');
    expect((await api(ctx, superAdmin).post(`/admin/payments/${co.payment.id}/confirm`, { reference: 'again' })).statusCode).toBe(409);

    // support cancels it: the refund is approved but NOT marked sent, since no gateway can return a bank transfer
    expect((await api(ctx, superAdmin).post(`/admin/orders/${number}/cancel`, { reason: 'Customer asked by phone' })).statusCode).toBe(200);
    const refunds = (await api(ctx, superAdmin).get('/admin/refunds?status=APPROVED')).json();
    const refund = refunds.find((r: { order?: { number: string } }) => r.order?.number === number);
    expect(refund).toMatchObject({ amountPaisa: 100_000 + (await prisma.order.findUniqueOrThrow({ where: { number } })).deliveryChargePaisa });
    const paid = await api(ctx, superAdmin).post(`/admin/refunds/${refund.id}/mark-paid`, { reference: 'REFUND-TX-9' });
    expect(paid.json()).toMatchObject({ status: 'PROCESSED', providerRef: 'REFUND-TX-9' });
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: co.payment.id } })).status).toBe('REFUNDED');
  });

  it('rejecting a transfer cancels the waiting order and puts stock back', async () => {
    const v = await prisma.productVariant.findFirstOrThrow({ where: { name: '1 lb', product: { slug: 'demo-chocolate-cake' } } });
    const co = await order('BANK_TRANSFER');
    const stockAfterOrder = (await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock;
    const r = await api(ctx, superAdmin).post(`/admin/payments/${co.payment.id}/reject`, { reason: 'No transfer received' });
    expect(r.json().status).toBe('FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { number: co.orders[0]! } })).status).toBe('CANCELLED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stock).toBe(stockAfterOrder + 1);
  });

  it('admin cancel of a sandbox-paid order refunds automatically', async () => {
    const co = await order('MOCK');
    await api(ctx, owner).post(`/vendor/orders/${co.orders[0]}/transition`, { to: 'ACCEPTED' });
    const o = (await api(ctx, superAdmin).post(`/admin/orders/${co.orders[0]}/cancel`, { reason: 'Vendor oven broke' })).json();
    expect(o.status).toBe('CANCELLED');
    expect(o.refunds[0].status).toBe('PROCESSED');
    expect((await api(ctx, superAdmin).post(`/admin/orders/${co.orders[0]}/cancel`, { reason: 'x' })).statusCode).toBe(400);
  });
});

describe('payouts', () => {
  it('builds one payout per vendor for a finished period, once, and records payment', async () => {
    const co = await order('MOCK');
    const n = co.orders[0]!;
    for (const to of ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY']) await api(ctx, owner).post(`/vendor/orders/${n}/transition`, { to });
    await api(ctx, owner).post(`/vendor/orders/${n}/transition`, { to: 'DELIVERED', photoUrl: 'https://example.com/p.jpg' });
    const yesterday = pktDate(-1);
    await prisma.order.update({ where: { number: n }, data: { deliveredAt: new Date(`${yesterday}T12:00:00+05:00`) } });
    const o = await prisma.order.findUniqueOrThrow({ where: { number: n } });

    expect((await api(ctx, superAdmin).post('/admin/payouts/generate', { from: yesterday, to: pktDate(0) })).json().error.code).toBe('PERIOD_OPEN');
    const gen = await api(ctx, superAdmin).post('/admin/payouts/generate', { from: yesterday, to: yesterday });
    expect(gen.statusCode).toBe(201);
    const p = gen.json().created.find((x: { vendorId: string }) => x.vendorId === o.vendorId);
    expect(p).toMatchObject({ grossPaisa: o.totalPaisa, commissionPaisa: o.commissionPaisa, netPaisa: o.totalPaisa - o.commissionPaisa, status: 'PENDING' });
    expect((await api(ctx, superAdmin).post('/admin/payouts/generate', { from: yesterday, to: yesterday })).json().created).toHaveLength(0);

    expect((await api(ctx, superAdmin).post(`/admin/payouts/${p.id}/mark-paid`, {})).json().error.code).toBe('REFERENCE_REQUIRED');
    expect((await api(ctx, superAdmin).post(`/admin/payouts/${p.id}/mark-paid`, { reference: 'IBFT-123' })).json().status).toBe('PAID');
    // the vendor sees it in their earnings
    expect((await api(ctx, owner).get('/vendor/earnings')).json().paidOutPaisa).toBe(p.netPaisa);
  });
});

describe('users', () => {
  it('blocking logs the user out and stops new logins', async () => {
    const victimToken = await login(ctx, '03409998888');
    void victimToken;
    const u = (await api(ctx, superAdmin).get('/admin/users?q=3409998888')).json()[0];
    expect((await api(ctx, superAdmin).post(`/admin/users/${u.id}/block`, {})).json().error.code).toBe('REASON_REQUIRED');
    expect((await api(ctx, superAdmin).post(`/admin/users/${u.id}/block`, { reason: 'Fake orders' })).json().isBlocked).toBe(true);
    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    await expect(login(ctx, '03409998888')).rejects.toThrow(/BLOCKED/);
    await api(ctx, superAdmin).post(`/admin/users/${u.id}/unblock`, {});
    await expect(login(ctx, '03409998888')).resolves.toBeTruthy();
  });
});
