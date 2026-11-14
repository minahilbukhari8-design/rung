/** Service booking state machine + advance/remaining + cancellation refund maths. */
import { applyBps, assertPaisa, BPS_DENOMINATOR, type Paisa } from './money.js';
import { InvalidTransitionError, type Actor } from './order-state.js';

export const BOOKING_STATUSES = [
  'REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'COMPLETED',
  'FULLY_PAID',
  'CANCELLED',
  'NO_SHOW_VENDOR',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const T: Record<BookingStatus, { to: BookingStatus; by: Actor[] }[]> = {
  REQUESTED: [
    { to: 'ACCEPTED', by: ['VENDOR', 'ADMIN'] },
    { to: 'DECLINED', by: ['VENDOR', 'ADMIN'] },
    { to: 'EXPIRED', by: ['SYSTEM'] },
    { to: 'CANCELLED', by: ['CUSTOMER', 'ADMIN'] },
  ],
  ACCEPTED: [
    { to: 'CONFIRMED', by: ['SYSTEM'] }, // advance payment succeeded
    { to: 'EXPIRED', by: ['SYSTEM'] }, // advance not paid by advanceDueBy
    { to: 'CANCELLED', by: ['CUSTOMER', 'VENDOR', 'ADMIN'] },
  ],
  CONFIRMED: [
    { to: 'RESCHEDULE_REQUESTED', by: ['CUSTOMER', 'VENDOR'] },
    { to: 'FULLY_PAID', by: ['SYSTEM'] }, // remaining paid before the event
    { to: 'COMPLETED', by: ['VENDOR', 'ADMIN'] },
    { to: 'CANCELLED', by: ['CUSTOMER', 'VENDOR', 'ADMIN'] },
    { to: 'NO_SHOW_VENDOR', by: ['ADMIN'] },
  ],
  RESCHEDULE_REQUESTED: [
    { to: 'CONFIRMED', by: ['CUSTOMER', 'VENDOR', 'ADMIN'] }, // other party accepts or request withdrawn
    { to: 'CANCELLED', by: ['CUSTOMER', 'VENDOR', 'ADMIN'] },
  ],
  FULLY_PAID: [
    { to: 'COMPLETED', by: ['VENDOR', 'ADMIN'] },
    { to: 'RESCHEDULE_REQUESTED', by: ['CUSTOMER', 'VENDOR'] },
    { to: 'CANCELLED', by: ['CUSTOMER', 'VENDOR', 'ADMIN'] },
    { to: 'NO_SHOW_VENDOR', by: ['ADMIN'] },
  ],
  COMPLETED: [{ to: 'FULLY_PAID', by: ['SYSTEM', 'ADMIN'] }], // remaining collected after the event
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  NO_SHOW_VENDOR: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  return T[from].some((t) => t.to === to && t.by.includes(actor));
}

export const MAX_RESCHEDULES = 2;

export function assertBookingTransition(i: {
  from: BookingStatus;
  to: BookingStatus;
  actor: Actor;
  rescheduleCount?: number;
}): BookingStatus {
  if (!canTransitionBooking(i.from, i.to, i.actor)) throw new InvalidTransitionError('booking', i.from, i.to, i.actor);
  if (i.to === 'RESCHEDULE_REQUESTED' && (i.rescheduleCount ?? 0) >= MAX_RESCHEDULES) {
    throw new InvalidTransitionError('booking (reschedule limit reached)', i.from, i.to, i.actor);
  }
  return i.to;
}

export interface BookingQuote {
  totalPaisa: Paisa;
  advancePaisa: Paisa;
  remainingPaisa: Paisa;
  commissionPaisa: Paisa;
}

export function quoteBooking(packagePricePaisa: Paisa, addOnsPaisa: Paisa, advanceBps: number, commissionBps: number): BookingQuote {
  assertPaisa(packagePricePaisa);
  assertPaisa(addOnsPaisa);
  const totalPaisa = packagePricePaisa + addOnsPaisa;
  const advancePaisa = applyBps(totalPaisa, advanceBps);
  return {
    totalPaisa,
    advancePaisa,
    remainingPaisa: totalPaisa - advancePaisa,
    commissionPaisa: applyBps(totalPaisa, commissionBps),
  };
}

export interface CancellationTier {
  hoursBefore: number;
  refundBps: number;
}

/**
 * Refund for a customer cancellation: pick the first tier (sorted by hoursBefore desc)
 * whose threshold the cancellation still meets. Vendor/admin-caused cancellations refund 100%.
 */
export function cancellationRefund(
  paidPaisa: Paisa,
  hoursBeforeEvent: number,
  tiers: CancellationTier[],
  cancelledBy: Actor,
): Paisa {
  assertPaisa(paidPaisa);
  if (cancelledBy === 'VENDOR' || cancelledBy === 'ADMIN') return paidPaisa;
  const sorted = [...tiers].sort((a, b) => b.hoursBefore - a.hoursBefore);
  const tier = sorted.find((t) => hoursBeforeEvent >= t.hoursBefore);
  const bps = tier ? tier.refundBps : 0;
  return Math.min(paidPaisa, applyBps(paidPaisa, Math.min(bps, BPS_DENOMINATOR)));
}
