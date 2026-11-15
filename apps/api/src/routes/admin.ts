import type { Prisma } from '@prisma/client';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { ApiError, badRequest, conflict, notFound, parse, prisma, requireAdmin } from '../lib/core.js';
import { ORDER_VENDOR_SLA_MIN, processApprovedRefunds, transitionOrder } from '../lib/orders.js';
import { cancelBooking, move } from './bookings.js';

const reason = z.string().trim().min(3).max(300);
const page = z.object({ q: z.string().trim().max(60).optional(), status: z.string().max(40).optional(), take: z.coerce.number().int().min(1).max(200).default(50) });

async function audit(req: FastifyRequest, actorId: string, action: string, entity: string, entityId: string, data?: Prisma.InputJsonValue) {
  await prisma.auditLog.create({ data: { actorId, action, entity, entityId, data, ip: req.ip } });
}

/** Start of the day in Pakistan time (UTC+5), as a UTC instant. */
function pktDayStart(d = new Date()): Date {
  const pkt = new Date(d.getTime() + 5 * 3600_000);
  return new Date(Date.UTC(pkt.getUTCFullYear(), pkt.getUTCMonth(), pkt.getUTCDate()) - 5 * 3600_000);
}

export async function adminRoutes(app: FastifyInstance, adapters: Adapters) {
  app.get('/admin/me', async (req) => {
    const a = await requireAdmin(req);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { id: true, phone: true, name: true } });
    return { ...u, permissions: a.permissions };
  });

  // ---------- overview ----------
  app.get('/admin/overview', async (req) => {
    await requireAdmin(req);
    const today = pktDayStart();
    const week = new Date(today.getTime() - 6 * 86_400_000);
    const [vendorsPending, docsPending, ordersByStatus, bookingsByStatus, transfersPending, refundsManual, ordersToday, gmv7, lateOrders] = await Promise.all([
      prisma.vendor.count({ where: { status: 'PENDING_REVIEW' } }),
      prisma.vendorDocument.count({ where: { status: 'SUBMITTED' } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.payment.count({ where: { provider: 'BANK_TRANSFER', status: 'PENDING' } }),
      prisma.refund.count({ where: { status: { in: ['APPROVED', 'REQUESTED'] } } }),
      prisma.order.count({ where: { placedAt: { gte: today } } }),
      prisma.order.aggregate({ where: { status: 'DELIVERED', deliveredAt: { gte: week } }, _sum: { totalPaisa: true, commissionPaisa: true } }),
      prisma.order.count({ where: { status: 'PLACED', vendorRespondBy: { lt: new Date() } } }),
    ]);
    const map = (rows: { status: string; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count._all]));
    return {
      queues: { vendorsPending, docsPending, transfersPending, refundsManual, lateOrders },
      orders: map(ordersByStatus),
      bookings: map(bookingsByStatus),
      ordersToday,
      last7Days: { deliveredGmvPaisa: gmv7._sum.totalPaisa ?? 0, commissionPaisa: gmv7._sum.commissionPaisa ?? 0 },
    };
  });

  // ---------- vendors + KYC ----------
  app.get('/admin/vendors/:id', async (req) => {
    await requireAdmin(req, 'OPS');
    const { id } = req.params as { id: string };
    const v = await prisma.vendor.findUnique({
      where: { id },
      include: {
        documents: { orderBy: { createdAt: 'desc' } },
        members: { include: { user: { select: { phone: true, name: true } } } },
        _count: { select: { products: true, services: true, orders: true, bookings: true } },
      },
    });
    if (!v) throw notFound('Vendor');
    const { payoutAccountEncrypted: _hidden, ...rest } = v;
    return { ...rest, hasPayoutAccount: Boolean(_hidden) };
  });

  app.patch('/admin/vendors/:id', async (req) => {
    const a = await requireAdmin(req, 'OPS');
    const { id } = req.params as { id: string };
    const body = parse(z.object({ commissionBps: z.number().int().min(0).max(5000).optional(), isVerified: z.boolean().optional() }), req.body);
    const v = await prisma.vendor.update({ where: { id }, data: body }).catch(() => null);
    if (!v) throw notFound('Vendor');
    await audit(req, a.id, 'vendor.update', 'Vendor', id, body);
    return v;
  });

  app.get('/admin/documents', async (req) => {
    await requireAdmin(req, 'OPS');
    const { status } = parse(z.object({ status: z.enum(['SUBMITTED', 'ACCEPTED', 'REJECTED']).default('SUBMITTED') }), req.query);
    const docs = await prisma.vendorDocument.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, take: 100, include: { vendor: { select: { id: true, name: true, slug: true, status: true } } } });
    return docs.map((d) => ({ ...d, fileUrl: `/api/v1/files/${d.storageKey}` }));
  });

  app.post('/admin/documents/:id/review', async (req) => {
    const a = await requireAdmin(req, 'OPS');
    const { id } = req.params as { id: string };
    const body = parse(z.object({ status: z.enum(['ACCEPTED', 'REJECTED']), note: z.string().max(300).optional() }), req.body);
    if (body.status === 'REJECTED' && !body.note) throw badRequest('REASON_REQUIRED', 'Say why the document was rejected');
    const doc = await prisma.vendorDocument.findUnique({ where: { id } });
    if (!doc) throw notFound('Document');
    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.vendorDocument.update({ where: { id }, data: { status: body.status, reviewNote: body.note ?? null, reviewedBy: a.id } });
      // a vendor is "verified" once both sides of the CNIC are accepted
      const accepted = await tx.vendorDocument.findMany({ where: { vendorId: doc.vendorId, status: 'ACCEPTED' }, select: { type: true } });
      const types = new Set(accepted.map((x) => x.type));
      await tx.vendor.update({ where: { id: doc.vendorId }, data: { isVerified: types.has('CNIC_FRONT') && types.has('CNIC_BACK') } });
      return d;
    });
    await audit(req, a.id, `document.${body.status.toLowerCase()}`, 'VendorDocument', id, { vendorId: doc.vendorId, note: body.note });
    return updated;
  });

  // ---------- orders ----------
  app.get('/admin/orders', async (req) => {
    await requireAdmin(req, 'SUPPORT');
    const { q, status, take } = parse(page, req.query);
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status: status as never } : {}),
      ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { recipientPhone: { contains: q } }, { senderPhone: { contains: q } }, { customer: { phone: { contains: q } } }] } : {}),
    };
    return prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { vendor: { select: { name: true, slug: true } }, customer: { select: { phone: true, name: true } } } });
  });

  app.get('/admin/orders/:number', async (req) => {
    await requireAdmin(req, 'SUPPORT');
    const { number } = req.params as { number: string };
    const o = await prisma.order.findUnique({
      where: { number },
      include: { items: true, events: { orderBy: { createdAt: 'asc' } }, refunds: true, vendor: { select: { id: true, name: true, phone: true } }, customer: { select: { phone: true, name: true } }, group: { include: { payments: true } } },
    });
    if (!o) throw notFound('Order');
    return o;
  });

  app.post('/admin/orders/:number/cancel', async (req) => {
    const a = await requireAdmin(req, 'SUPPORT');
    const { number } = req.params as { number: string };
    const body = parse(z.object({ reason }), req.body);
    const o = await transitionOrder(adapters, { orderNumber: number, to: 'CANCELLED', actor: 'ADMIN', actorId: a.id, note: body.reason });
    await audit(req, a.id, 'order.cancel', 'Order', o.id, { number, reason: body.reason });
    return o;
  });

  // ---------- bookings ----------
  app.get('/admin/bookings', async (req) => {
    await requireAdmin(req, 'SUPPORT');
    const { q, status, take } = parse(page, req.query);
    const where: Prisma.BookingWhereInput = {
      ...(status ? { status: status as never } : {}),
      ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { customer: { phone: { contains: q } } }] } : {}),
    };
    return prisma.booking.findMany({ where, orderBy: { createdAt: 'desc' }, take, include: { vendor: { select: { name: true, slug: true } }, customer: { select: { phone: true, name: true } } } });
  });

  app.post('/admin/bookings/:number/cancel', async (req) => {
    const a = await requireAdmin(req, 'SUPPORT');
    const { number } = req.params as { number: string };
    const body = parse(z.object({ reason }), req.body);
    const r = await cancelBooking(adapters, number, 'ADMIN', a.id, body.reason, {});
    await audit(req, a.id, 'booking.cancel', 'Booking', r.booking.id, { number, reason: body.reason, refundPaisa: r.refundPaisa });
    return r;
  });

  // ---------- payments: bank transfer review ----------
  app.get('/admin/payments', async (req) => {
    await requireAdmin(req, 'FINANCE');
    const { status } = parse(z.object({ status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).default('PENDING') }), req.query);
    return prisma.payment.findMany({
      where: { status, ...(status === 'PENDING' ? { provider: 'BANK_TRANSFER' } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { orderGroup: { include: { orders: { select: { number: true, status: true } }, customer: { select: { phone: true } } } }, booking: { select: { number: true, status: true, customer: { select: { phone: true } } } } },
    });
  });

  app.post('/admin/payments/:id/:decision', async (req) => {
    const a = await requireAdmin(req, 'FINANCE');
    const { id, decision } = req.params as { id: string; decision: string };
    if (decision !== 'confirm' && decision !== 'reject') throw notFound('Action');
    const body = parse(z.object({ reference: z.string().trim().max(80).optional(), reason: z.string().max(300).optional() }), req.body ?? {});
    const p = await prisma.payment.findUnique({ where: { id }, include: { orderGroup: { include: { orders: true } }, booking: true } });
    if (!p || p.provider !== 'BANK_TRANSFER') throw notFound('Payment');
    if (p.status !== 'PENDING') throw conflict('PAYMENT_NOT_PENDING', 'This payment was already decided');

    if (decision === 'reject') {
      if (!body.reason) throw badRequest('REASON_REQUIRED', 'Say why the transfer was rejected');
      await prisma.payment.update({ where: { id }, data: { status: 'FAILED', failureReason: body.reason } });
      for (const o of p.orderGroup?.orders ?? []) {
        if (o.status === 'PENDING_PAYMENT') await transitionOrder(adapters, { orderNumber: o.number, to: 'CANCELLED', actor: 'ADMIN', actorId: a.id, note: `Bank transfer not received: ${body.reason}` });
      }
      await audit(req, a.id, 'payment.reject', 'Payment', id, { reason: body.reason });
      return prisma.payment.findUniqueOrThrow({ where: { id } });
    }

    if (!body.reference) throw badRequest('REFERENCE_REQUIRED', 'Enter the bank transaction reference');
    await prisma.$transaction(async (tx) => {
      const moved = await tx.payment.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'SUCCEEDED', providerRef: body.reference, succeededAt: new Date() } });
      if (moved.count !== 1) throw conflict('CONCURRENT_UPDATE', 'Payment changed, please refresh');
      for (const o of p.orderGroup?.orders ?? []) {
        if (o.status !== 'PENDING_PAYMENT') continue;
        await tx.order.update({ where: { id: o.id }, data: { status: 'PLACED', placedAt: new Date(), vendorRespondBy: new Date(Date.now() + ORDER_VENDOR_SLA_MIN * 60_000) } });
        await tx.orderStatusEvent.create({ data: { orderId: o.id, from: 'PENDING_PAYMENT', to: 'PLACED', actorType: 'ADMIN', actorId: a.id, note: 'Bank transfer confirmed' } });
      }
      if (p.booking) {
        const fresh = await tx.booking.update({ where: { id: p.booking.id }, data: { paidPaisa: { increment: p.amountPaisa } } });
        if (p.purpose === 'BOOKING_ADVANCE' && fresh.status === 'ACCEPTED') await move(tx, fresh, 'CONFIRMED', 'ADMIN', a.id, 'Advance received by bank transfer');
        else if (p.purpose === 'BOOKING_REMAINING' && fresh.paidPaisa >= fresh.totalPaisa && ['CONFIRMED', 'COMPLETED'].includes(fresh.status)) await move(tx, fresh, 'FULLY_PAID', 'ADMIN', a.id, 'Balance received by bank transfer');
      }
    });
    await audit(req, a.id, 'payment.confirm', 'Payment', id, { reference: body.reference, amountPaisa: p.amountPaisa });
    return prisma.payment.findUniqueOrThrow({ where: { id } });
  });

  // ---------- refunds ----------
  app.get('/admin/refunds', async (req) => {
    await requireAdmin(req, 'FINANCE');
    const { status } = parse(z.object({ status: z.enum(['REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED']).default('APPROVED') }), req.query);
    return prisma.refund.findMany({
      where: { status },
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: { payment: { select: { provider: true, isSandbox: true, providerRef: true } }, order: { select: { number: true } }, booking: { select: { number: true } } },
    });
  });

  /** Refunds the gateway can't send (COD, bank transfer) are paid by hand and recorded here. */
  app.post('/admin/refunds/:id/:decision', async (req) => {
    const a = await requireAdmin(req, 'FINANCE');
    const { id, decision } = req.params as { id: string; decision: string };
    const body = parse(z.object({ reference: z.string().trim().max(80).optional(), reason: z.string().max(300).optional() }), req.body ?? {});
    const r = await prisma.refund.findUnique({ where: { id }, include: { payment: true } });
    if (!r) throw notFound('Refund');
    if (decision === 'approve') {
      if (r.status !== 'REQUESTED') throw conflict('REFUND_NOT_REQUESTED', 'Only requested refunds can be approved');
      await prisma.refund.update({ where: { id }, data: { status: 'APPROVED', decidedBy: a.id } });
      await processApprovedRefunds(adapters, r.orderId ? { orderId: r.orderId } : { bookingId: r.bookingId! });
    } else if (decision === 'reject') {
      if (r.status !== 'REQUESTED') throw conflict('REFUND_NOT_REQUESTED', 'Only requested refunds can be rejected');
      if (!body.reason) throw badRequest('REASON_REQUIRED', 'A reason is required');
      await prisma.refund.update({ where: { id }, data: { status: 'REJECTED', decidedBy: a.id } });
    } else if (decision === 'mark-paid') {
      if (r.status !== 'APPROVED') throw conflict('REFUND_NOT_APPROVED', 'Only approved refunds can be marked paid');
      if (!body.reference) throw badRequest('REFERENCE_REQUIRED', 'Enter the transfer reference');
      await prisma.$transaction(async (tx) => {
        await tx.refund.update({ where: { id }, data: { status: 'PROCESSED', providerRef: body.reference, processedAt: new Date(), decidedBy: a.id } });
        const total = await tx.refund.aggregate({ where: { paymentId: r.paymentId, status: 'PROCESSED' }, _sum: { amountPaisa: true } });
        await tx.payment.update({ where: { id: r.paymentId }, data: { status: (total._sum.amountPaisa ?? 0) >= r.payment.amountPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
      });
    } else throw notFound('Action');
    await audit(req, a.id, `refund.${decision}`, 'Refund', id, { ...body, amountPaisa: r.amountPaisa });
    return prisma.refund.findUniqueOrThrow({ where: { id } });
  });

  // ---------- payouts ----------
  app.get('/admin/payouts', async (req) => {
    await requireAdmin(req, 'FINANCE');
    const { status } = parse(z.object({ status: z.enum(['PENDING', 'PROCESSING', 'PAID', 'ON_HOLD']).optional() }), req.query);
    return prisma.payout.findMany({ where: { status }, orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }], take: 200, include: { vendor: { select: { name: true, slug: true, isDemo: true } } } });
  });

  /**
   * Builds one payout per vendor for a closed period (dates in PKT, inclusive):
   * delivered orders (total − commission) + bookings completed in the period (collected − commission).
   * Periods already generated for a vendor are skipped.
   */
  app.post('/admin/payouts/generate', async (req, reply) => {
    const a = await requireAdmin(req, 'FINANCE');
    const body = parse(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body);
    const periodStart = new Date(`${body.from}T00:00:00+05:00`);
    const periodEnd = new Date(new Date(`${body.to}T00:00:00+05:00`).getTime() + 86_400_000 - 1);
    if (!(periodEnd > periodStart)) throw badRequest('BAD_PERIOD', 'The end date must be after the start date');
    if (periodEnd > new Date()) throw badRequest('PERIOD_OPEN', 'Only finished periods can be paid out');
    const [orders, bookings] = await Promise.all([
      prisma.order.groupBy({ by: ['vendorId'], where: { status: 'DELIVERED', deliveredAt: { gte: periodStart, lte: periodEnd } }, _sum: { totalPaisa: true, commissionPaisa: true } }),
      prisma.booking.groupBy({ by: ['vendorId'], where: { status: { in: ['COMPLETED', 'FULLY_PAID'] }, completedAt: { gte: periodStart, lte: periodEnd } }, _sum: { paidPaisa: true, commissionPaisa: true } }),
    ]);
    const per = new Map<string, { gross: number; commission: number }>();
    for (const r of [...orders.map((o) => ({ v: o.vendorId, g: o._sum.totalPaisa ?? 0, c: o._sum.commissionPaisa ?? 0 })), ...bookings.map((b) => ({ v: b.vendorId, g: b._sum.paidPaisa ?? 0, c: b._sum.commissionPaisa ?? 0 }))]) {
      const cur = per.get(r.v) ?? { gross: 0, commission: 0 };
      per.set(r.v, { gross: cur.gross + r.g, commission: cur.commission + r.c });
    }
    const created = [];
    for (const [vendorId, x] of per) {
      if (x.gross <= 0) continue;
      const exists = await prisma.payout.findUnique({ where: { vendorId_periodStart_periodEnd: { vendorId, periodStart, periodEnd } } });
      if (exists) continue;
      created.push(await prisma.payout.create({ data: { vendorId, periodStart, periodEnd, grossPaisa: x.gross, commissionPaisa: x.commission, netPaisa: x.gross - x.commission } }));
    }
    await audit(req, a.id, 'payout.generate', 'Payout', `${body.from}..${body.to}`, { count: created.length });
    reply.code(201);
    return { created };
  });

  app.post('/admin/payouts/:id/:action', async (req) => {
    const a = await requireAdmin(req, 'FINANCE');
    const { id, action } = req.params as { id: string; action: string };
    const body = parse(z.object({ reference: z.string().trim().max(80).optional() }), req.body ?? {});
    const p = await prisma.payout.findUnique({ where: { id } });
    if (!p) throw notFound('Payout');
    const next = ({ hold: 'ON_HOLD', release: 'PENDING', 'mark-paid': 'PAID' } as Record<string, 'ON_HOLD' | 'PENDING' | 'PAID'>)[action];
    if (!next) throw notFound('Action');
    if (p.status === 'PAID') throw conflict('PAYOUT_PAID', 'This payout is already paid');
    if (next === 'PAID' && !body.reference) throw badRequest('REFERENCE_REQUIRED', 'Enter the bank transfer reference');
    const updated = await prisma.payout.update({ where: { id }, data: { status: next, ...(next === 'PAID' ? { reference: body.reference, paidAt: new Date() } : {}) } });
    await audit(req, a.id, `payout.${action}`, 'Payout', id, body);
    return updated;
  });

  // ---------- users ----------
  app.get('/admin/users', async (req) => {
    await requireAdmin(req, 'SUPPORT');
    const { q, take } = parse(page, req.query);
    return prisma.user.findMany({
      where: q ? { OR: [{ phone: { contains: q.replace(/^0/, '') } }, { name: { contains: q, mode: 'insensitive' } }] } : {},
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, phone: true, name: true, roles: true, adminPermissions: true, isBlocked: true, isDemo: true, createdAt: true, _count: { select: { orders: true, bookings: true } } },
    });
  });

  app.post('/admin/users/:id/:action', async (req) => {
    const a = await requireAdmin(req, 'SUPPORT');
    const { id, action } = req.params as { id: string; action: string };
    if (action !== 'block' && action !== 'unblock') throw notFound('Action');
    const body = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    if (action === 'block' && !body.reason) throw badRequest('REASON_REQUIRED', 'A reason is required');
    if (id === a.id) throw new ApiError(400, 'SELF', 'You cannot block yourself');
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound('User');
    if (target.roles.includes('ADMIN') && !a.permissions.includes('SUPERADMIN')) throw new ApiError(403, 'FORBIDDEN', 'Only a super admin can block an admin');
    const u = await prisma.$transaction(async (tx) => {
      const r = await tx.user.update({ where: { id }, data: { isBlocked: action === 'block' }, select: { id: true, phone: true, isBlocked: true } });
      if (action === 'block') await tx.session.deleteMany({ where: { userId: id } }); // logs them out everywhere
      return r;
    });
    await audit(req, a.id, `user.${action}`, 'User', id, body);
    return u;
  });

  // ---------- reviews ----------
  app.get('/admin/reviews', async (req) => {
    await requireAdmin(req, 'SUPPORT');
    return prisma.review.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { vendor: { select: { name: true } }, customer: { select: { phone: true } } } });
  });

  app.post('/admin/reviews/:id/:action', async (req) => {
    const a = await requireAdmin(req, 'SUPPORT');
    const { id, action } = req.params as { id: string; action: string };
    if (action !== 'hide' && action !== 'show') throw notFound('Action');
    const r = await prisma.review.update({ where: { id }, data: { isHidden: action === 'hide' } }).catch(() => null);
    if (!r) throw notFound('Review');
    await audit(req, a.id, `review.${action}`, 'Review', id);
    return r;
  });
}
