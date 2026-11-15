/**
 * The single place that turns a payment result into order / booking changes.
 * Used by: instant sandbox payments, gateway callbacks (JazzCash, Easypaisa), and finance confirming bank transfers.
 * Idempotent: a payment that is no longer INITIATED/PENDING is left alone.
 */
import type { ActorType, Payment } from '@prisma/client';
import type { Adapters } from '../adapters/index.js';
import { move } from '../routes/bookings.js';
import { prisma } from './core.js';
import { ORDER_VENDOR_SLA_MIN, transitionOrder } from './orders.js';

export type SettleOutcome =
  | { status: 'SUCCEEDED'; providerRef?: string; amountPaisa?: number; raw?: unknown; note?: string }
  | { status: 'FAILED'; reason: string; raw?: unknown };

export interface SettleResult {
  payment: Payment;
  changed: boolean;
  /** set when the gateway says it took a different amount than we asked for */
  amountMismatch?: boolean;
}

export async function settlePayment(adapters: Adapters, paymentId: string, outcome: SettleOutcome, actor: { type: ActorType; id?: string } = { type: 'SYSTEM' }): Promise<SettleResult> {
  const p = await prisma.payment.findUnique({ where: { id: paymentId }, include: { orderGroup: { include: { orders: true } }, booking: true } });
  if (!p) throw new Error(`payment ${paymentId} not found`);
  if (p.status !== 'INITIATED' && p.status !== 'PENDING') return { payment: p, changed: false };
  // keep what checkout stored (client / returnTo) and add the gateway's answer next to it
  const meta = p.rawResponse && typeof p.rawResponse === 'object' && !Array.isArray(p.rawResponse) ? (p.rawResponse as Record<string, unknown>) : {};
  const raw = outcome.raw === undefined ? undefined : { ...meta, gateway: JSON.parse(JSON.stringify(outcome.raw)) };

  if (outcome.status === 'SUCCEEDED' && outcome.amountPaisa !== undefined && outcome.amountPaisa !== p.amountPaisa) {
    // Never place an order on a wrong amount. Keep it PENDING with a note so finance sees it in the queue.
    const payment = await prisma.payment.update({ where: { id: p.id }, data: { status: 'PENDING', failureReason: `Amount mismatch: gateway reported ${outcome.amountPaisa}, expected ${p.amountPaisa}. Needs review.`, rawResponse: raw } });
    await prisma.auditLog.create({ data: { action: 'payment.amount_mismatch', entity: 'Payment', entityId: p.id, data: { reported: outcome.amountPaisa, expected: p.amountPaisa } } });
    return { payment, changed: true, amountMismatch: true };
  }

  if (outcome.status === 'FAILED') {
    const moved = await prisma.payment.updateMany({ where: { id: p.id, status: p.status }, data: { status: 'FAILED', failureReason: outcome.reason.slice(0, 300), rawResponse: raw } });
    if (moved.count !== 1) return { payment: await prisma.payment.findUniqueOrThrow({ where: { id: p.id } }), changed: false };
    for (const o of p.orderGroup?.orders ?? []) {
      if (o.status === 'PENDING_PAYMENT') await transitionOrder(adapters, { orderNumber: o.number, to: 'CANCELLED', actor: actor.type, actorId: actor.id, note: `Payment not completed: ${outcome.reason}`.slice(0, 300) });
    }
    return { payment: await prisma.payment.findUniqueOrThrow({ where: { id: p.id } }), changed: true };
  }

  const now = new Date();
  const changed = await prisma.$transaction(async (tx) => {
    const moved = await tx.payment.updateMany({ where: { id: p.id, status: p.status }, data: { status: 'SUCCEEDED', providerRef: outcome.providerRef ?? p.providerRef, succeededAt: now, failureReason: null, ...(raw !== undefined ? { rawResponse: raw } : {}) } });
    if (moved.count !== 1) return false;
    for (const o of p.orderGroup?.orders ?? []) {
      if (o.status === 'PENDING_PAYMENT') {
        await tx.order.update({ where: { id: o.id }, data: { status: 'PLACED', placedAt: now, vendorRespondBy: new Date(now.getTime() + ORDER_VENDOR_SLA_MIN * 60_000) } });
        await tx.orderStatusEvent.create({ data: { orderId: o.id, from: 'PENDING_PAYMENT', to: 'PLACED', actorType: actor.type, actorId: actor.id, note: outcome.note ?? 'Payment confirmed' } });
      } else {
        // money arrived for an order that was already cancelled: hand it to finance to return
        await tx.refund.create({ data: { paymentId: p.id, orderId: o.id, amountPaisa: o.totalPaisa, reason: `Paid after the order was ${o.status.toLowerCase()}`, status: 'REQUESTED' } });
      }
    }
    if (p.booking) {
      const fresh = await tx.booking.update({ where: { id: p.booking.id }, data: { paidPaisa: { increment: p.amountPaisa } } });
      if (p.purpose === 'BOOKING_ADVANCE' && fresh.status === 'ACCEPTED') await move(tx, fresh, 'CONFIRMED', actor.type, actor.id, outcome.note ?? 'Advance paid');
      else if (p.purpose === 'BOOKING_REMAINING' && fresh.paidPaisa >= fresh.totalPaisa && ['CONFIRMED', 'COMPLETED'].includes(fresh.status)) await move(tx, fresh, 'FULLY_PAID', actor.type, actor.id, outcome.note ?? 'Remaining paid');
      else if (p.purpose === 'BOOKING_ADVANCE' && fresh.status !== 'CONFIRMED') {
        await tx.refund.create({ data: { paymentId: p.id, bookingId: fresh.id, amountPaisa: p.amountPaisa, reason: `Advance paid after the booking was ${fresh.status.toLowerCase()}`, status: 'REQUESTED' } });
      }
    }
    return true;
  });
  return { payment: await prisma.payment.findUniqueOrThrow({ where: { id: p.id } }), changed };
}
