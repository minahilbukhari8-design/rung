import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalStorage } from '../src/adapters/index.js';
import { api, login, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let owner: string;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex').toString('base64');
const PDF = Buffer.from('%PDF-1.4\n%demo\n').toString('base64');

beforeAll(async () => {
  ctx = await setup();
  ctx.adapters.storage = new LocalStorage(`/tmp/rung-test-uploads-${Date.now()}`);
  const { buildApp } = await import('../src/app.js');
  await ctx.app.close();
  ctx.app = await buildApp(ctx.adapters);
  owner = await login(ctx, '03000000101'); // DEMO bakery owner
});
afterAll(async () => {
  await ctx.app.close();
});

describe('vendor account', () => {
  it('returns the vendor for members and null for others', async () => {
    expect((await api(ctx, owner).get('/vendor/me')).json()).toMatchObject({ role: 'OWNER', vendor: { slug: 'demo-bakery' } });
    const stranger = await login(ctx, '03191919191');
    expect((await api(ctx, stranger).get('/vendor/me')).json()).toEqual({ vendor: null, role: null });
    expect((await api(ctx, stranger).get('/vendor/products')).statusCode).toBe(403);
  });

  it('lists products with variants and updates stock/price/status', async () => {
    const list = (await api(ctx, owner).get('/vendor/products')).json();
    expect(list[0].variants.length).toBe(2);
    const v = list[0].variants[0];
    const r = await api(ctx, owner).patch(`/vendor/variants/${v.id}`, { stock: 3, pricePaisa: 120_000 });
    expect(r.json()).toMatchObject({ stock: 3, pricePaisa: 120_000 });
    const paused = await api(ctx, owner).patch(`/vendor/products/${list[0].id}`, { status: 'PAUSED' });
    expect(paused.json().status).toBe('PAUSED');
    expect((await api(ctx).get('/products')).json().items).toHaveLength(0); // hidden from customers
    await api(ctx, owner).patch(`/vendor/products/${list[0].id}`, { status: 'ACTIVE' });
  });

  it('blocks closed days from delivery slots', async () => {
    const d = new Date(Date.now() + 5 * 3600_000 + 4 * 86_400_000).toISOString().slice(0, 10);
    const b = await api(ctx, owner).post('/vendor/blackouts', { date: d, reason: 'Family wedding' });
    expect(b.statusCode).toBe(201);
    const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' } });
    const zone = await prisma.deliveryZone.findFirstOrThrow({ where: { name: 'DHA' } });
    expect((await api(ctx).get(`/products/${p.id}/delivery-slots?zone=${zone.id}&date=${d}`)).json().slots).toEqual([]);
    await api(ctx, owner).post(`/vendor/blackouts/${b.json().id}`, {}); // wrong verb ignored
    const del = await ctx.app.inject({ method: 'DELETE', url: `/api/v1/vendor/blackouts/${b.json().id}`, headers: { authorization: `Bearer ${owner}` } });
    expect(del.json().deleted).toBe(1);
  });

  it('owner adds staff; staff can see orders but not earnings', async () => {
    const r = await api(ctx, owner).post('/vendor/staff', { phone: '0320 1112222' });
    expect(r.statusCode).toBe(201);
    const staff = await login(ctx, '03201112222');
    expect((await api(ctx, staff).get('/vendor/orders')).statusCode).toBe(200);
    expect((await api(ctx, staff).get('/vendor/earnings')).statusCode).toBe(403);
    expect((await api(ctx, staff).post('/vendor/staff', { phone: '03203334444' })).statusCode).toBe(403);
  });

  it('reports stats and earnings after a delivered order', async () => {
    const customer = await login(ctx, '03212223333');
    const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' }, include: { variants: true } });
    const v = p.variants.find((x) => x.name === '2 lb')!;
    const addr = (await api(ctx, customer).post('/me/addresses', { recipientName: 'A', recipientPhone: '03212223334', line1: 'House 1 Road', area: 'DHA' })).json();
    await api(ctx, customer).post('/cart/items', { variantId: v.id, quantity: 1 });
    const date = new Date(Date.now() + 5 * 3600_000 + 2 * 86_400_000).toISOString().slice(0, 10);
    const co = await api(ctx, customer).post('/checkout', { provider: 'MOCK', idempotencyKey: 'vendor-test-1', senderName: 'S', groups: [{ vendorId: p.vendorId, addressId: addr.id, date, slotStartMinute: 900 }] });
    const n = co.json().orders[0];
    for (const to of ['ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY']) await api(ctx, owner).post(`/vendor/orders/${n}/transition`, { to });
    await api(ctx, owner).post(`/vendor/orders/${n}/transition`, { to: 'DELIVERED', photoUrl: 'https://example.com/p.jpg' });
    const stats = (await api(ctx, owner).get('/vendor/stats')).json();
    expect(stats.orders.DELIVERED).toBe(1);
    const e = (await api(ctx, owner).get('/vendor/earnings')).json();
    expect(e.orders).toMatchObject({ count: 1, grossPaisa: 200_000, commissionPaisa: 24_000, netPaisa: 176_000 });
  });
});

describe('uploads', () => {
  it('stores KYC privately: only the uploader and admins can read it', async () => {
    const up = await api(ctx, owner).post('/uploads', { purpose: 'KYC', contentType: 'application/pdf', dataBase64: PDF });
    expect(up.statusCode).toBe(201);
    expect(up.json().key).toMatch(/^private\//);
    const doc = await api(ctx, owner).post('/vendor/documents', { type: 'CNIC_FRONT', key: up.json().key });
    expect(doc.json().status).toBe('SUBMITTED');
    expect((await api(ctx, owner).get(`/files/${up.json().key}`)).statusCode).toBe(200);
    const other = await login(ctx, '03231231234');
    expect((await api(ctx, other).get(`/files/${up.json().key}`)).statusCode).toBe(404);
    expect((await api(ctx).get(`/files/${up.json().key}`)).statusCode).toBe(401);
  });

  it('rejects files whose bytes do not match the type, and oversize files', async () => {
    expect((await api(ctx, owner).post('/uploads', { purpose: 'LISTING_IMAGE', contentType: 'image/png', dataBase64: PDF })).json().error.code).toBe('BAD_FILE_TYPE');
    expect((await api(ctx, owner).post('/uploads', { purpose: 'LISTING_IMAGE', contentType: 'text/html', dataBase64: PNG })).json().error.code).toBe('BAD_FILE_TYPE');
    const big = Buffer.alloc(5 * 1024 * 1024 + 10, 0);
    big.write('89504e47', 'hex');
    expect((await api(ctx, owner).post('/uploads', { purpose: 'LISTING_IMAGE', contentType: 'image/png', dataBase64: big.toString('base64') })).json().error.code).toBe('FILE_TOO_LARGE');
  });

  it('adds a public product image that anyone can load', async () => {
    const up = (await api(ctx, owner).post('/uploads', { purpose: 'LISTING_IMAGE', contentType: 'image/png', dataBase64: PNG })).json();
    const p = await prisma.product.findFirstOrThrow({ where: { slug: 'demo-chocolate-cake' } });
    const img = await api(ctx, owner).post(`/vendor/products/${p.id}/images`, { key: up.key });
    expect(img.statusCode).toBe(201);
    const file = await api(ctx).get(img.json().url.replace('/api/v1', ''));
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    // can't attach someone else's upload
    const other = await login(ctx, '03241241241');
    const theirs = (await api(ctx, other).post('/uploads', { purpose: 'LISTING_IMAGE', contentType: 'image/png', dataBase64: PNG })).json();
    expect((await api(ctx, owner).post(`/vendor/products/${p.id}/images`, { key: theirs.key })).json().error.code).toBe('BAD_KEY');
  });

  it('refuses path tricks in file keys', async () => {
    expect((await api(ctx, owner).get('/files/private/../../etc/passwd')).statusCode).toBe(404);
  });
});
