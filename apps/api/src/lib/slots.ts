import { prisma } from './core.js';

/** Pakistan Standard Time is UTC+5 all year (no DST). */
export const PKT_OFFSET_MIN = 5 * 60;

/** "2026-12-01" → Date at 00:00 UTC (used for @db.Date columns). */
export function dateOnly(ymd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('date must be YYYY-MM-DD');
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** The real instant a PKT wall-clock minute on a given date starts. */
export function pktInstant(ymd: string, minuteOfDay: number): Date {
  return new Date(dateOnly(ymd).getTime() + (minuteOfDay - PKT_OFFSET_MIN) * 60_000);
}

export function todayPkt(now = new Date()): string {
  return new Date(now.getTime() + PKT_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

export interface SlotOption {
  startMinute: number;
  endMinute: number;
  remaining: number;
}

/**
 * Delivery slots a vendor can still take for a zone/date, honouring capacity, blackouts,
 * product lead time and the zone's same-day cut-off. Returns [] when the vendor doesn't serve the zone.
 */
export async function availableSlots(opts: {
  vendorId: string;
  zoneId: string;
  ymd: string;
  leadTimeMinutes: number;
  now?: Date;
}): Promise<SlotOption[]> {
  const now = opts.now ?? new Date();
  const vz = await prisma.vendorDeliveryZone.findUnique({ where: { vendorId_zoneId: { vendorId: opts.vendorId, zoneId: opts.zoneId } } });
  if (!vz?.isActive) return [];
  const date = dateOnly(opts.ymd);
  const blackout = await prisma.vendorBlackout.findFirst({ where: { vendorId: opts.vendorId, date, serviceId: null } });
  if (blackout) return [];

  const isToday = opts.ymd === todayPkt(now);
  if (isToday) {
    if (vz.sameDayCutoffMinute == null) return [];
    const nowMinute = Math.floor(((now.getTime() / 60_000 + PKT_OFFSET_MIN) % 1440 + 1440) % 1440);
    if (nowMinute > vz.sameDayCutoffMinute) return [];
  }

  const dow = date.getUTCDay();
  const slots = await prisma.vendorDeliverySlot.findMany({
    where: { vendorId: opts.vendorId, dayOfWeek: dow, isActive: true },
    orderBy: { startMinute: 'asc' },
  });
  const taken = await prisma.order.groupBy({
    by: ['slotStartMinute'],
    where: { vendorId: opts.vendorId, deliveryDate: date, status: { notIn: ['CANCELLED', 'REJECTED'] } },
    _count: { _all: true },
  });
  const takenBy = new Map(taken.map((t) => [t.slotStartMinute, t._count._all]));
  const earliest = now.getTime() + opts.leadTimeMinutes * 60_000;

  return slots
    .filter((s) => pktInstant(opts.ymd, s.startMinute).getTime() >= earliest)
    .map((s) => ({ startMinute: s.startMinute, endMinute: s.endMinute, remaining: s.capacity - (takenBy.get(s.startMinute) ?? 0) }))
    .filter((s) => s.remaining > 0);
}
