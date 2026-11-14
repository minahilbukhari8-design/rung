import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyBps,
  assertBookingTransition,
  assertOrderTransition,
  BOOKING_STATUSES,
  canTransitionOrder,
  cancellationRefund,
  formatPKR,
  normalizePkMobile,
  ORDER_STATUSES,
  quoteBooking,
  rupeesToPaisa,
  sumPaisa,
} from '../src/index.js';

describe('money', () => {
  it('converts rupees to integer paisa', () => {
    expect(rupeesToPaisa(2500)).toBe(250000);
    expect(rupeesToPaisa(19.99)).toBe(1999);
  });
  it('rejects negative and fractional paisa', () => {
    expect(() => sumPaisa([100, -1])).toThrow(RangeError);
    expect(() => sumPaisa([1.5])).toThrow(RangeError);
  });
  it('applies basis points with half-up rounding', () => {
    expect(applyBps(100000, 1200)).toBe(12000);
    expect(applyBps(333, 5000)).toBe(167); // 166.5 → 167
    expect(() => applyBps(100, 10001)).toThrow(RangeError);
  });
  it('formats PKR in English and Urdu with Western digits', () => {
    expect(formatPKR(250000)).toBe('Rs 2,500');
    expect(formatPKR(250050)).toBe('Rs 2,500.50');
    expect(formatPKR(250000, 'ur')).toBe('2,500 روپے');
  });
});

describe('phone', () => {
  it.each([
    ['03001234567', '+923001234567'],
    ['3001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['+92 300 1234567', '+923001234567'],
    ['0092-300-1234567', '+923001234567'],
  ])('normalises %s', (input, out) => expect(normalizePkMobile(input)).toBe(out));
  it.each(['04235761234', '0300123456', '+14155550100', 'abc'])('rejects %s', (input) =>
    expect(normalizePkMobile(input)).toBeNull(),
  );
});

describe('order state machine', () => {
  it('runs the happy path', () => {
    const path = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY'] as const;
    const actors = ['SYSTEM', 'VENDOR', 'VENDOR', 'VENDOR'] as const;
    for (let i = 0; i < actors.length; i++) {
      expect(canTransitionOrder(path[i]!, path[i + 1]!, actors[i]!)).toBe(true);
    }
    expect(assertOrderTransition({ from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', actor: 'VENDOR', deliveryPhotoUrl: 'x.jpg' })).toBe('DELIVERED');
  });
  it('requires a delivery photo', () => {
    expect(() => assertOrderTransition({ from: 'OUT_FOR_DELIVERY', to: 'DELIVERED', actor: 'VENDOR' })).toThrow(/photo/);
  });
  it('stops customers from accepting their own orders or skipping steps', () => {
    expect(canTransitionOrder('PLACED', 'ACCEPTED', 'CUSTOMER')).toBe(false);
    expect(canTransitionOrder('PLACED', 'DELIVERED', 'VENDOR')).toBe(false);
  });
  it('allows free customer cancel before acceptance, and only inside the window after', () => {
    expect(canTransitionOrder('PLACED', 'CANCELLED', 'CUSTOMER')).toBe(true);
    expect(() => assertOrderTransition({ from: 'ACCEPTED', to: 'CANCELLED', actor: 'CUSTOMER', minutesUntilSlot: 60 })).toThrow(/window/);
    expect(assertOrderTransition({ from: 'ACCEPTED', to: 'CANCELLED', actor: 'CUSTOMER', minutesUntilSlot: 2000 })).toBe('CANCELLED');
  });
  it('treats delivered/cancelled/rejected as terminal', () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransitionOrder('DELIVERED', to, 'ADMIN')).toBe(false);
      expect(canTransitionOrder('CANCELLED', to, 'ADMIN')).toBe(false);
    }
  });
});

describe('booking state machine and money', () => {
  it('quotes advance and remaining that add up to the total', () => {
    const q = quoteBooking(15_000_000, 250_000, 3000, 1000);
    expect(q.totalPaisa).toBe(15_250_000);
    expect(q.advancePaisa + q.remainingPaisa).toBe(q.totalPaisa);
    expect(q.advancePaisa).toBe(4_575_000);
    expect(q.commissionPaisa).toBe(1_525_000);
  });
  it('only confirms after payment (SYSTEM), never by customer', () => {
    expect(() => assertBookingTransition({ from: 'ACCEPTED', to: 'CONFIRMED', actor: 'CUSTOMER' })).toThrow();
    expect(assertBookingTransition({ from: 'ACCEPTED', to: 'CONFIRMED', actor: 'SYSTEM' })).toBe('CONFIRMED');
  });
  it('limits reschedules', () => {
    expect(() =>
      assertBookingTransition({ from: 'CONFIRMED', to: 'RESCHEDULE_REQUESTED', actor: 'CUSTOMER', rescheduleCount: 2 }),
    ).toThrow(/limit/);
  });
  it('computes tiered cancellation refunds', () => {
    const tiers = [
      { hoursBefore: 168, refundBps: 10000 },
      { hoursBefore: 48, refundBps: 5000 },
      { hoursBefore: 0, refundBps: 0 },
    ];
    expect(cancellationRefund(100000, 200, tiers, 'CUSTOMER')).toBe(100000);
    expect(cancellationRefund(100000, 72, tiers, 'CUSTOMER')).toBe(50000);
    expect(cancellationRefund(100000, 5, tiers, 'CUSTOMER')).toBe(0);
    expect(cancellationRefund(100000, 5, tiers, 'VENDOR')).toBe(100000);
  });
});

describe('domain enums match the Prisma schema', () => {
  const schema = readFileSync(new URL('../../db/prisma/schema.prisma', import.meta.url), 'utf8');
  const enumValues = (name: string) => {
    const m = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
    if (!m) throw new Error(`enum ${name} not found`);
    return m[1]!
      .split('\n')
      .map((l: string) => l.replace(/\/\/.*/, '').trim())
      .filter(Boolean);
  };
  it('OrderStatus', () => expect(enumValues('OrderStatus')).toEqual([...ORDER_STATUSES]));
  it('BookingStatus', () => expect(enumValues('BookingStatus')).toEqual([...BOOKING_STATUSES]));
});
