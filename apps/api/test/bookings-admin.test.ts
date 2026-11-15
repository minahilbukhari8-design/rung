import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, login, prisma, setup, type Ctx } from './helpers.js';

let ctx: Ctx;
let customer: string;
let vendor: string;
let packageId: string;

const daysFromNow = (d: number, hourUtc = 13) => {
  const t = new Date(Date.now() + d * 86_400_000);
  t.setUTCHours(hourUtc, 0, 0, 0);
  return t.toISOString();
};
const venue = { name: 'Home', address: 'House 5, Street 9', area: 'DHA' };

beforeAll(async () => {
  ctx = await setup();
  customer = await login(ctx, '03141414141');
  vendor = await login(ctx, '03000000102'); // DEMO decor owner
  packageId = (await prisma.servicePackage.findFirstOrThrow({ where: { name: 'DEMO Basic' } })).id;
});
afterAll(async () => {
  await ctx.app.close();
});

async function requestBooking(days: number) {
  const r = await api(ctx, customer).post('/bookings', { packageId, eventStart: daysFromNow(days), venue, guestCount: 100 });
  expect(r.statusCode).toBe(201);
  return r.json().number as string;
}

describe('service bookings', () => {
  it('runs request → accept → advance → reschedule → remaining → complete', async () => {
    const n = await requestBooking(20);
    const b0 = await prisma.booking.findUniqueOrThrow({ where: { number: n } });
    expect(b0).toMatchObject({ status: 'REQUESTED', totalPaisa: 1_000_000, advancePaisa: 300_000, remainingPaisa: 700_000 });

    // can't pay before vendor accepts
    expect((await api(ctx, customer).post(`/bookings/${n}/pay`, { stage: 'advance', provider: 'MOCK', idempotencyKey: `${n}-adv-early` })).statusCode).toBe(409);

    expect((await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'ACCEPTED' })).statusCode).toBe(200);
    const adv = await api(ctx, customer).post(`/bookings/${n}/pay`, { stage: 'advance', provider: 'MOCK', idempotencyKey: `${n}-adv` });
    expect(adv.statusCode).toBe(201);
    expect((await prisma.booking.findUniqueOrThrow({ where: { number: n } })).status).toBe('CONFIRMED');

    // customer proposes a new date; vendor accepts
    const newStart = daysFromNow(25);
    expect((await api(ctx, customer).post(`/bookings/${n}/reschedule`, { eventStart: newStart })).statusCode).toBe(200);
    // the requester cannot approve their own request
    expect((await api(ctx, customer).post(`/bookings/${n}/reschedule/respond`, { accept: true })).statusCode).toBe(403);
    const resp = await api(ctx, vendor).post(`/bookings/${n}/reschedule/respond`, { accept: true });
    expect(resp.json()).toMatchObject({ status: 'CONFIRMED', rescheduleCount: 1, eventStart: newStart });

    const rem = await api(ctx, customer).post(`/bookings/${n}/pay`, { stage: 'remaining', provider: 'MOCK', idempotencyKey: `${n}-rem` });
    expect(rem.statusCode).toBe(201);
    const paid = await prisma.booking.findUniqueOrThrow({ where: { number: n } });
    expect(paid).toMatchObject({ status: 'FULLY_PAID', paidPaisa: 1_000_000 });

    // can't mark completed before the event
    expect((await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'COMPLETED' })).statusCode).toBe(409);
  });

  it('blocks a second booking on a fully-booked day (max 1 per day)', async () => {
    await requestBooking(30);
    const r = await api(ctx, customer).post('/bookings', { packageId, eventStart: daysFromNow(30, 16), venue });
    expect(r.json().error.code).toBe('DATE_UNAVAILABLE');
    const cal = await api(ctx).get(`/services/${(await prisma.service.findFirstOrThrow()).id}/availability?month=${daysFromNow(30).slice(0, 7)}`);
    const day = cal.json().days.find((d: { date: string }) => d.date === daysFromNow(30).slice(0, 10));
    expect(day).toMatchObject({ available: false, remaining: 0 });
  });

  it('refunds by the frozen cancellation tiers', async () => {
    const n = await requestBooking(4); // 96 hours away → 50% tier
    await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'ACCEPTED' });
    await api(ctx, customer).post(`/bookings/${n}/pay`, { stage: 'advance', provider: 'MOCK', idempotencyKey: `${n}-adv` });
    // vendor changes their policy later: must not affect this booking
    await prisma.cancellationPolicy.updateMany({ data: { tiers: [{ hoursBefore: 0, refundBps: 0 }] } });
    const r = await api(ctx, customer).post(`/bookings/${n}/cancel`, { reason: 'Event postponed' });
    expect(r.json().refundPaisa).toBe(150_000);
    expect(r.json().booking.refunds[0]).toMatchObject({ amountPaisa: 150_000, status: 'PROCESSED' });
  });

  it('vendor cancellation refunds everything and needs a reason', async () => {
    const n = await requestBooking(40);
    await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'ACCEPTED' });
    await api(ctx, customer).post(`/bookings/${n}/pay`, { stage: 'advance', provider: 'MOCK', idempotencyKey: `${n}-adv` });
    expect((await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'CANCELLED' })).statusCode).toBe(400);
    const r = await api(ctx, vendor).post(`/vendor/bookings/${n}/transition`, { to: 'CANCELLED', note: 'Team unavailable' });
    expect(r.json().status).toBe('CANCELLED');
    expect(r.json().refunds[0].amountPaisa).toBe(300_000);
  });

  it('expires requests the vendor ignores, and accepted bookings with no advance', async () => {
    const n1 = await requestBooking(50);
    const n2 = await requestBooking(51);
    await api(ctx, vendor).post(`/vendor/bookings/${n2}/transition`, { to: 'ACCEPTED' });
    await prisma.booking.update({ where: { number: n1 }, data: { vendorRespondBy: new Date(Date.now() - 1) } });
    await prisma.booking.update({ where: { number: n2 }, data: { advanceDueBy: new Date(Date.now() - 1) } });
    const admin = await login(ctx, '03151515151');
    await prisma.user.update({ where: { phone: '+923151515151' }, data: { roles: ['CUSTOMER', 'ADMIN'], adminPermissions: ['SUPERADMIN'] } });
    const r = await api(ctx, admin).post('/admin/jobs/expire');
    expect(r.json().bookingsExpired).toBe(2);
    expect((await prisma.booking.findUniqueOrThrow({ where: { number: n1 } })).status).toBe('EXPIRED');
    expect((await prisma.booking.findUniqueOrThrow({ where: { number: n2 } })).status).toBe('EXPIRED');
  });

  it('needs 24 hours notice and respects guest limits', async () => {
    expect((await api(ctx, customer).post('/bookings', { packageId, eventStart: new Date(Date.now() + 3600_000).toISOString(), venue })).json().error.code).toBe('TOO_SOON');
    expect((await api(ctx, customer).post('/bookings', { packageId, eventStart: daysFromNow(60), venue, guestCount: 400 })).json().error.code).toBe('GUESTS_OUT_OF_RANGE');
  });
});

describe('vendor onboarding and admin', () => {
  it('a customer applies as a vendor, cannot go live until approved, admin approves with audit log', async () => {
    const owner = await login(ctx, '03161616161');
    const apply = await api(ctx, owner).post('/vendor/apply', { slug: 'new-florist', name: 'New Florist', kind: 'PRODUCTS', phone: '03161616161' });
    expect(apply.statusCode).toBe(201);
    expect(apply.json().status).toBe('PENDING_REVIEW');
    const flowers = await prisma.category.findUniqueOrThrow({ where: { slug: 'flowers' } });
    const product = { slug: 'roses', title: 'Roses', categoryId: flowers.id, status: 'ACTIVE', variants: [{ name: '12 stems', pricePaisa: 1, stock: 1 }] };
    const blocked = await api(ctx, owner).post('/vendor/products', product);
    expect(blocked.json().error.code).toBe('VENDOR_NOT_APPROVED');

    // non-admin can't approve
    expect((await api(ctx, owner).post(`/admin/vendors/${apply.json().id}/approve`)).statusCode).toBe(403);
    const admin = await login(ctx, '03171717171');
    await prisma.user.update({ where: { phone: '+923171717171' }, data: { roles: ['CUSTOMER', 'ADMIN'], adminPermissions: ['SUPERADMIN'] } });
    const ok = await api(ctx, admin).post(`/admin/vendors/${apply.json().id}/approve`, { commissionBps: 1000 });
    expect(ok.json()).toMatchObject({ status: 'APPROVED', commissionBps: 1000 });
    expect(await prisma.auditLog.count({ where: { action: 'vendor.approve', entityId: apply.json().id } })).toBe(1);
    expect((await api(ctx, owner).post('/vendor/products', product)).statusCode).toBe(201);
    // rejecting needs a reason
    expect((await api(ctx, admin).post(`/admin/vendors/${apply.json().id}/suspend`)).statusCode).toBe(400);
  });
});
