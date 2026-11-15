import { Prisma, type ActorType, type OrderStatus } from '@prisma/client';
import { assertOrderTransition, InvalidTransitionError } from '@rung/domain';
import type { Adapters } from '../adapters/index.js';
import { ApiError, conflict, notFound, prisma } from './core.js';
import { PKT_OFFSET_MIN } from './slots.js';

type Tx = Prisma.TransactionClient;

export const ORDER_VENDOR_SLA_MIN = 120; // vendor must accept within 2 hours

function toApi(e: unknown): never {
  if (e instanceof InvalidTransitionError) throw new ApiError(409, 'INVALID_TRANSITION', e.message);
  throw e;
}

/** Restore stock for every item of an order (used on cancel/reject). */
async function restock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, include: { variant: true } });
  for (const it of items) {
    if (it.variant.trackInventory) await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } });
  }
}

export interface TransitionOpts {
  orderNumber: string;
  to: OrderStatus;
  actor: ActorType;
  actorId?: string;
  note?: string;
  photoUrl?: string;
  /** limit to orders of this vendor / customer (authorisation) */
  vendorId?: string;
  customerId?: string;
  now?: Date;
}

export async function transitionOrder(adapters: Adapters, o: TransitionOpts) {
  const now = o.now ?? new Date();
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { number: o.orderNumber }, include: { group: { include: { payments: true } } } });
    if (!order || (o.vendorId && order.vendorId !== o.vendorId) || (o.customerId && order.customerId !== o.customerId)) throw notFound('Order');

    const slotStart = order.deliveryDate.getTime() + (order.slotStartMinute - PKT_OFFSET_MIN) * 60_000;
    try {
      assertOrderTransition({
        from: order.status,
        to: o.to,
        actor: o.actor,
        deliveryPhotoUrl: o.photoUrl,
        minutesUntilSlot: Math.floor((slotStart - now.getTime()) / 60_000),
      });
    } catch (e) {
      toApi(e);
    }
    if ((o.to === 'REJECTED' || o.to === 'CANCELLED') && !o.note && o.actor !== 'SYSTEM' && o.actor !== 'CUSTOMER') {
      throw new ApiError(400, 'REASON_REQUIRED', 'A reason is required');
    }

    // optimistic concurrency: only move if still in the status we read
    const moved = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: {
        status: o.to,
        ...(o.to === 'DELIVERED' ? { deliveredAt: now, deliveryProofUrl: o.photoUrl } : {}),
        ...(o.to === 'CANCELLED' || o.to === 'REJECTED' ? { cancelReason: o.note ?? null, cancelledBy: o.actor } : {}),
      },
    });
    if (moved.count !== 1) throw conflict('CONCURRENT_UPDATE', 'Order changed, please refresh');
    await tx.orderStatusEvent.create({ data: { orderId: order.id, from: order.status, to: o.to, actorType: o.actor, actorId: o.actorId, note: o.note, photoUrl: o.photoUrl } });

    let refund: { paymentId: string; amountPaisa: number } | null = null;
    if (o.to === 'CANCELLED' || o.to === 'REJECTED') {
      await restock(tx, order.id);
      const paid = order.group.payments.find((p) => p.status === 'SUCCEEDED' || p.status === 'PARTIALLY_REFUNDED');
      if (paid) {
        await tx.refund.create({ data: { paymentId: paid.id, orderId: order.id, amountPaisa: order.totalPaisa, reason: `Order ${o.to.toLowerCase()}: ${o.note ?? ''}`.trim(), status: 'APPROVED' } });
        refund = { paymentId: paid.id, amountPaisa: order.totalPaisa };
      }
    }
    return { orderId: order.id, refund };
  });

  if (result.refund) await processApprovedRefunds(adapters, { orderId: result.orderId });
  return prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { events: { orderBy: { createdAt: 'asc' } }, refunds: true } });
}

/** Sends APPROVED refunds to the gateway and records the result. */
export async function processApprovedRefunds(adapters: Adapters, where: { orderId?: string; bookingId?: string }) {
  const refunds = await prisma.refund.findMany({ where: { ...where, status: 'APPROVED' }, include: { payment: true } });
  for (const r of refunds) {
    const gw = adapters.payments[r.payment.provider];
    if (!gw || gw.manualRefunds) continue; // stays APPROVED until finance records the manual transfer
    const res = await gw.refund(r.payment.providerRef, r.amountPaisa);
    await prisma.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: r.id }, data: { status: 'PROCESSED', providerRef: res.providerRef, processedAt: new Date() } });
      const total = await tx.refund.aggregate({ where: { paymentId: r.paymentId, status: 'PROCESSED' }, _sum: { amountPaisa: true } });
      const refunded = total._sum.amountPaisa ?? 0;
      await tx.payment.update({ where: { id: r.paymentId }, data: { status: refunded >= r.payment.amountPaisa ? 'REFUNDED' : 'PARTIALLY_REFUNDED' } });
    });
  }
}

/** Background job: auto-reject orders the vendor didn't answer in time. */
export async function expireUnansweredOrders(adapters: Adapters, now = new Date()) {
  const overdue = await prisma.order.findMany({ where: { status: 'PLACED', vendorRespondBy: { lt: now } }, select: { number: true } });
  for (const o of overdue) {
    await transitionOrder(adapters, { orderNumber: o.number, to: 'REJECTED', actor: 'SYSTEM', note: 'Vendor did not respond in time', now });
  }
  return overdue.length;
}

export function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}
