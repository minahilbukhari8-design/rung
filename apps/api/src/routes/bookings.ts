import type { ActorType, BookingStatus, PaymentProvider, Prisma } from '@prisma/client';
import { assertBookingTransition, cancellationRefund, InvalidTransitionError, quoteBooking, type CancellationTier } from '@rung/domain';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { settlePayment } from '../lib/payments.js';
import { paymentStartUrl } from './payments.js';
import { ApiError, badRequest, conflict, forbidden, humanNumber, notFound, parse, prisma, requireUser, requireVendor } from '../lib/core.js';
import { isUniqueViolation, processApprovedRefunds } from '../lib/orders.js';

export const BOOKING_VENDOR_SLA_MS = 24 * 3600_000;
export const ADVANCE_DUE_MS = 48 * 3600_000;
const ACTIVE: BookingStatus[] = ['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'FULLY_PAID'];

/** PKT calendar day of an instant. */
const pktDay = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
const dayBoundsUtc = (ymd: string) => {
  const start = new Date(`${ymd}T00:00:00.000Z`).getTime() - 5 * 3600_000;
  return { gte: new Date(start), lt: new Date(start + 86_400_000) };
};

async function assertDateAvailable(serviceId: string, vendorId: string, maxPerDay: number, at: Date, excludeBookingId?: string) {
  const ymd = pktDay(at);
  const blackout = await prisma.vendorBlackout.findFirst({ where: { vendorId, date: new Date(`${ymd}T00:00:00.000Z`), OR: [{ serviceId: null }, { serviceId }] } });
  if (blackout) throw conflict('DATE_UNAVAILABLE', 'Vendor is not available on that date');
  const n = await prisma.booking.count({ where: { serviceId, status: { in: ACTIVE }, eventStart: dayBoundsUtc(ymd), ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}) } });
  if (n >= maxPerDay) throw conflict('DATE_UNAVAILABLE', 'That date is fully booked');
}

function wrap(e: unknown): never {
  if (e instanceof InvalidTransitionError) throw new ApiError(409, 'INVALID_TRANSITION', e.message);
  throw e;
}

export async function move(
  tx: Prisma.TransactionClient,
  b: { id: string; status: BookingStatus; rescheduleCount: number },
  to: BookingStatus,
  actor: ActorType,
  actorId: string | undefined,
  note: string | undefined,
  data: Prisma.BookingUpdateManyMutationInput = {},
) {
  try {
    assertBookingTransition({ from: b.status, to, actor, rescheduleCount: b.rescheduleCount });
  } catch (e) {
    wrap(e);
  }
  const r = await tx.booking.updateMany({ where: { id: b.id, status: b.status }, data: { status: to, ...data } });
  if (r.count !== 1) throw conflict('CONCURRENT_UPDATE', 'Booking changed, please refresh');
  await tx.bookingStatusEvent.create({ data: { bookingId: b.id, from: b.status, to, actorType: actor, actorId, note } });
}

export async function cancelBooking(adapters: Adapters, number: string, actor: ActorType, actorId: string | undefined, reason: string | undefined, scope: { customerId?: string; vendorId?: string }, now = new Date()) {
  const result = await prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { number }, include: { payments: { where: { status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } }, orderBy: { createdAt: 'desc' } } } });
    if (!b || (scope.customerId && b.customerId !== scope.customerId) || (scope.vendorId && b.vendorId !== scope.vendorId)) throw notFound('Booking');
    if (actor !== 'CUSTOMER' && !reason) throw badRequest('REASON_REQUIRED', 'A reason is required');
    const hours = (b.eventStart.getTime() - now.getTime()) / 3600_000;
    const tiers = (b.policySnapshot as CancellationTier[] | null) ?? [];
    const refundTotal = cancellationRefund(b.paidPaisa, hours, tiers, actor === 'SYSTEM' ? 'ADMIN' : actor);
    await move(tx, b, 'CANCELLED', actor, actorId, reason, { cancelReason: reason ?? null, cancelledBy: actor });
    let left = refundTotal;
    for (const p of b.payments) {
      if (left <= 0) break;
      const amt = Math.min(left, p.amountPaisa);
      await tx.refund.create({ data: { paymentId: p.id, bookingId: b.id, amountPaisa: amt, reason: `Booking cancelled by ${actor.toLowerCase()}`, status: 'APPROVED' } });
      left -= amt;
    }
    return { id: b.id, refundTotal };
  });
  await processApprovedRefunds(adapters, { bookingId: result.id });
  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: result.id }, include: { refunds: true, events: true } });
  return { booking, refundPaisa: result.refundTotal };
}

export async function expireBookings(now = new Date()) {
  const stale = await prisma.booking.findMany({
    where: { OR: [{ status: 'REQUESTED', vendorRespondBy: { lt: now } }, { status: 'ACCEPTED', advanceDueBy: { lt: now } }] },
  });
  for (const b of stale) {
    await prisma.$transaction((tx) => move(tx, b, 'EXPIRED', 'SYSTEM', undefined, b.status === 'REQUESTED' ? 'Vendor did not respond in time' : 'Advance not paid in time'));
  }
  return stale.length;
}

export async function bookingRoutes(app: FastifyInstance, adapters: Adapters) {
  app.post('/bookings', async (req, reply) => {
    const u = requireUser(req);
    const body = parse(
      z.object({
        packageId: z.string(),
        eventStart: z.string().datetime({ offset: true }),
        eventEnd: z.string().datetime({ offset: true }).optional(),
        venue: z.object({ name: z.string().max(120).optional(), address: z.string().min(3).max(300), area: z.string().max(80) }),
        guestCount: z.number().int().positive().max(5000).optional(),
        occasionId: z.string().optional(),
        notes: z.string().max(1000).optional(),
      }),
      req.body,
    );
    const pkg = await prisma.servicePackage.findUnique({ where: { id: body.packageId }, include: { service: { include: { vendor: true } }, cancellationPolicy: true } });
    if (!pkg || !pkg.isActive || pkg.service.status !== 'ACTIVE' || pkg.service.vendor.status !== 'APPROVED') throw notFound('Package');
    const start = new Date(body.eventStart);
    const now = new Date();
    if (start.getTime() < now.getTime() + 24 * 3600_000) throw badRequest('TOO_SOON', 'Bookings need at least 24 hours notice');
    if (body.guestCount && ((pkg.minGuests && body.guestCount < pkg.minGuests) || (pkg.maxGuests && body.guestCount > pkg.maxGuests))) {
      throw badRequest('GUESTS_OUT_OF_RANGE', `This package is for ${pkg.minGuests ?? 1}–${pkg.maxGuests ?? '∞'} guests`);
    }
    await assertDateAvailable(pkg.serviceId, pkg.service.vendorId, pkg.service.maxBookingsPerDay, start);

    const q = quoteBooking(pkg.pricePaisa, 0, pkg.advanceBps, pkg.service.vendor.commissionBps);
    const respondBy = new Date(Math.min(now.getTime() + BOOKING_VENDOR_SLA_MS, start.getTime()));
    const booking = await prisma.booking.create({
      data: {
        number: humanNumber('RB'), customerId: u.id, vendorId: pkg.service.vendorId, serviceId: pkg.serviceId, packageId: pkg.id, occasionId: body.occasionId,
        eventStart: start, eventEnd: body.eventEnd ? new Date(body.eventEnd) : null, venueSnapshot: body.venue, guestCount: body.guestCount, notes: body.notes,
        packageName: pkg.name, packagePricePaisa: pkg.pricePaisa, totalPaisa: q.totalPaisa, advanceBps: pkg.advanceBps, advancePaisa: q.advancePaisa,
        remainingPaisa: q.remainingPaisa, commissionBps: pkg.service.vendor.commissionBps, commissionPaisa: q.commissionPaisa,
        policySnapshot: (pkg.cancellationPolicy?.tiers as Prisma.InputJsonValue) ?? [],
        vendorRespondBy: respondBy,
        events: { create: { to: 'REQUESTED', actorType: 'CUSTOMER', actorId: u.id } },
      },
    });
    reply.code(201);
    return booking;
  });

  app.get('/bookings', async (req) => {
    const u = requireUser(req);
    return prisma.booking.findMany({ where: { customerId: u.id }, orderBy: { eventStart: 'desc' }, include: { vendor: { select: { name: true, slug: true } } } });
  });

  app.get('/bookings/:number', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const b = await prisma.booking.findFirst({ where: { number, customerId: u.id }, include: { events: { orderBy: { createdAt: 'asc' } }, payments: true, refunds: true, vendor: { select: { name: true, slug: true, phone: true } } } });
    if (!b) throw notFound('Booking');
    return b;
  });

  app.post('/bookings/:number/pay', async (req, reply) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const body = parse(z.object({ stage: z.enum(['advance', 'remaining']), provider: z.enum(['MOCK', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA']), idempotencyKey: z.string().min(8), client: z.enum(['web', 'app']).default('web'), returnTo: z.string().max(300).optional() }), req.body);
    const prior = await prisma.payment.findUnique({ where: { idempotencyKey: body.idempotencyKey } });
    if (prior) return { payment: prior, idempotentReplay: true };
    const b = await prisma.booking.findFirst({ where: { number, customerId: u.id } });
    if (!b) throw notFound('Booking');
    if (body.stage === 'advance' && b.status !== 'ACCEPTED') throw conflict('NOT_PAYABLE', 'Advance can be paid after the vendor accepts');
    if (body.stage === 'remaining' && !['CONFIRMED', 'COMPLETED'].includes(b.status)) throw conflict('NOT_PAYABLE', 'Remaining balance is not due yet');
    const amount = body.stage === 'advance' ? b.advancePaisa : b.totalPaisa - b.paidPaisa;
    if (amount <= 0) throw conflict('NOTHING_DUE', 'Nothing left to pay');
    const gw = adapters.payments[body.provider as PaymentProvider]!;
    let payment;
    try {
      payment = await prisma.payment.create({
        data: { purpose: body.stage === 'advance' ? 'BOOKING_ADVANCE' : 'BOOKING_REMAINING', provider: body.provider, amountPaisa: amount, bookingId: b.id, idempotencyKey: body.idempotencyKey, isSandbox: gw.isSandbox },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('DUPLICATE_PAYMENT', 'Already submitted');
      throw e;
    }
    reply.code(201);
    try {
      const r = await gw.init({ paymentId: payment.id, amountPaisa: amount, description: `RUNG booking ${b.number} (${body.stage})` });
      if (r.kind === 'redirect') {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', providerRef: r.providerRef, rawResponse: { client: body.client, returnTo: body.returnTo ?? null } } });
        return { payment: await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }), redirectUrl: paymentStartUrl(payment.id, body.client) };
      }
      if (r.kind !== 'succeeded') {
        return { payment: await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PENDING' } }), instructions: r.kind === 'pending' ? r.instructions : undefined };
      }
      const settled = await settlePayment(adapters, payment.id, { status: 'SUCCEEDED', providerRef: r.providerRef, note: body.stage === 'advance' ? 'Advance paid' : 'Remaining paid' });
      return { payment: settled.payment };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: (e as Error).message } });
      throw new ApiError(402, 'PAYMENT_FAILED', 'Payment failed. You have not been charged.');
    }
  });

  app.post('/bookings/:number/cancel', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const { reason } = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    return cancelBooking(adapters, number, 'CUSTOMER', u.id, reason, { customerId: u.id });
  });

  /** Either party proposes a new time. */
  app.post('/bookings/:number/reschedule', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const { eventStart } = parse(z.object({ eventStart: z.string().datetime({ offset: true }) }), req.body);
    const b = await prisma.booking.findUnique({ where: { number }, include: { service: true, vendor: { include: { members: true } } } });
    if (!b) throw notFound('Booking');
    const isCustomer = b.customerId === u.id;
    const isVendor = b.vendor.members.some((m) => m.userId === u.id);
    if (!isCustomer && !isVendor) throw notFound('Booking');
    const at = new Date(eventStart);
    if (at.getTime() < Date.now() + 24 * 3600_000) throw badRequest('TOO_SOON', 'New time must be at least 24 hours away');
    await assertDateAvailable(b.serviceId, b.vendorId, b.service.maxBookingsPerDay, at, b.id);
    await prisma.$transaction((tx) => move(tx, b, 'RESCHEDULE_REQUESTED', isCustomer ? 'CUSTOMER' : 'VENDOR', u.id, `from:${b.status}`, { proposedEventStart: at }));
    return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  });

  /** The other party answers. Accepting moves the event; either way the booking returns to its previous status. */
  app.post('/bookings/:number/reschedule/respond', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const { accept } = parse(z.object({ accept: z.boolean() }), req.body);
    const b = await prisma.booking.findUnique({ where: { number }, include: { vendor: { include: { members: true } }, events: { where: { to: 'RESCHEDULE_REQUESTED' }, orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!b || b.status !== 'RESCHEDULE_REQUESTED') throw notFound('Pending reschedule');
    const req0 = b.events[0]!;
    const isCustomer = b.customerId === u.id;
    const isVendor = b.vendor.members.some((m) => m.userId === u.id);
    if (!isCustomer && !isVendor) throw notFound('Booking');
    if ((req0.actorType === 'CUSTOMER' && !isVendor) || (req0.actorType === 'VENDOR' && !isCustomer)) throw forbidden('The other party must answer this request');
    const back = (req0.note?.replace('from:', '') as BookingStatus) === 'FULLY_PAID' ? 'FULLY_PAID' : 'CONFIRMED';
    await prisma.$transaction((tx) =>
      move(tx, b, back, isCustomer ? 'CUSTOMER' : 'VENDOR', u.id, accept ? 'Reschedule accepted' : 'Reschedule declined', {
        proposedEventStart: null,
        ...(accept ? { eventStart: b.proposedEventStart!, rescheduleCount: { increment: 1 } } : {}),
      }),
    );
    return prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  });

  // ---------- vendor side ----------
  app.get('/vendor/bookings', async (req) => {
    const { vendor } = await requireVendor(req);
    const q = parse(z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional() }), req.query);
    return prisma.booking.findMany({
      where: { vendorId: vendor.id, eventStart: { gte: q.from ? new Date(q.from) : undefined, lt: q.to ? new Date(q.to) : undefined } },
      orderBy: { eventStart: 'asc' },
      include: { customer: { select: { name: true, phone: true } } },
    });
  });

  app.post('/vendor/bookings/:number/transition', async (req) => {
    const { vendor, user } = await requireVendor(req);
    const { number } = req.params as { number: string };
    const body = parse(z.object({ to: z.enum(['ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED']), note: z.string().max(300).optional() }), req.body);
    if (body.to === 'CANCELLED') return (await cancelBooking(adapters, number, 'VENDOR', user.id, body.note, { vendorId: vendor.id })).booking;
    if (body.to === 'DECLINED' && !body.note) throw badRequest('REASON_REQUIRED', 'Tell the customer why');
    const b = await prisma.booking.findFirst({ where: { number, vendorId: vendor.id } });
    if (!b) throw notFound('Booking');
    if (body.to === 'COMPLETED' && b.eventStart > new Date()) throw conflict('EVENT_NOT_STARTED', 'Mark completed after the event');
    await prisma.$transaction((tx) =>
      move(tx, b, body.to, 'VENDOR', user.id, body.note, body.to === 'ACCEPTED' ? { advanceDueBy: new Date(Date.now() + ADVANCE_DUE_MS) } : body.to === 'COMPLETED' ? { completedAt: new Date() } : {}),
    );
    return prisma.booking.findUniqueOrThrow({ where: { id: b.id }, include: { events: true } });
  });
}
