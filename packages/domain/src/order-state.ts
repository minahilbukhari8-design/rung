/** Product order state machine. Mirrors `OrderStatus` in packages/db/prisma/schema.prisma. */

export const ORDER_STATUSES = [
  'PENDING_PAYMENT',
  'PLACED',
  'ACCEPTED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
  'FAILED_DELIVERY',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Actor = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SYSTEM';

interface Transition {
  to: OrderStatus;
  by: Actor[];
}

const T: Record<OrderStatus, Transition[]> = {
  PENDING_PAYMENT: [
    { to: 'PLACED', by: ['SYSTEM'] }, // payment confirmed or COD chosen
    { to: 'CANCELLED', by: ['CUSTOMER', 'SYSTEM', 'ADMIN'] }, // abandoned / payment failed
  ],
  PLACED: [
    { to: 'ACCEPTED', by: ['VENDOR', 'ADMIN'] },
    { to: 'REJECTED', by: ['VENDOR', 'ADMIN', 'SYSTEM'] }, // SYSTEM = vendor didn't respond in time
    { to: 'CANCELLED', by: ['CUSTOMER', 'ADMIN'] }, // free cancel before vendor accepts
  ],
  ACCEPTED: [
    { to: 'PREPARING', by: ['VENDOR', 'ADMIN'] },
    { to: 'CANCELLED', by: ['ADMIN', 'CUSTOMER'] }, // customer only inside cancellation window (checked by policy)
  ],
  PREPARING: [
    { to: 'OUT_FOR_DELIVERY', by: ['VENDOR', 'ADMIN'] },
    { to: 'CANCELLED', by: ['ADMIN'] },
  ],
  OUT_FOR_DELIVERY: [
    { to: 'DELIVERED', by: ['VENDOR', 'ADMIN'] }, // requires delivery photo
    { to: 'FAILED_DELIVERY', by: ['VENDOR', 'ADMIN'] },
  ],
  FAILED_DELIVERY: [
    { to: 'OUT_FOR_DELIVERY', by: ['VENDOR', 'ADMIN'] }, // re-attempt
    { to: 'CANCELLED', by: ['ADMIN'] },
  ],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export const ORDER_TERMINAL: ReadonlySet<OrderStatus> = new Set(['DELIVERED', 'CANCELLED', 'REJECTED']);

export function canTransitionOrder(from: OrderStatus, to: OrderStatus, actor: Actor): boolean {
  return T[from].some((t) => t.to === to && t.by.includes(actor));
}

export function nextOrderStatuses(from: OrderStatus, actor: Actor): OrderStatus[] {
  return T[from].filter((t) => t.by.includes(actor)).map((t) => t.to);
}

export class InvalidTransitionError extends Error {
  constructor(kind: string, from: string, to: string, actor: string) {
    super(`${kind}: ${actor} cannot move ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export interface OrderTransitionInput {
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  deliveryPhotoUrl?: string;
  /** minutes until the start of the delivery slot; used for customer cancellation after acceptance */
  minutesUntilSlot?: number;
  /** vendor's customer-cancellation window after acceptance, in minutes before slot (default 24h) */
  customerCancelCutoffMinutes?: number;
}

/** Throws when not allowed; returns the target status otherwise. */
export function assertOrderTransition(i: OrderTransitionInput): OrderStatus {
  if (!canTransitionOrder(i.from, i.to, i.actor)) throw new InvalidTransitionError('order', i.from, i.to, i.actor);
  if (i.to === 'DELIVERED' && !i.deliveryPhotoUrl) {
    throw new InvalidTransitionError('order (delivery photo required)', i.from, i.to, i.actor);
  }
  if (i.from === 'ACCEPTED' && i.to === 'CANCELLED' && i.actor === 'CUSTOMER') {
    const cutoff = i.customerCancelCutoffMinutes ?? 24 * 60;
    if (i.minutesUntilSlot === undefined || i.minutesUntilSlot < cutoff) {
      throw new InvalidTransitionError('order (cancellation window closed)', i.from, i.to, i.actor);
    }
  }
  return i.to;
}
