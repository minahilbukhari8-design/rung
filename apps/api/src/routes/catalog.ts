import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { notFound, parse, prisma } from '../lib/core.js';
import { availableSlots, dateOnly } from '../lib/slots.js';

/** Roman-Urdu / spelling variants so "mehendi" finds "mehndi" etc. */
const VARIANTS: string[][] = [
  ['mehndi', 'mehendi', 'mehandi', 'henna', 'مہندی'],
  ['cake', 'kek', 'کیک'],
  ['phool', 'flowers', 'flower', 'پھول'],
  ['tohfa', 'gift', 'gifts', 'تحفہ', 'تحفے'],
  ['sajawat', 'decor', 'decoration', 'سجاوٹ'],
  ['salgirah', 'saalgirah', 'birthday', 'سالگرہ'],
  ['shaadi', 'shadi', 'wedding', 'شادی'],
  ['eid', 'عید'],
];
export function expandQuery(q: string): string[] {
  const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const out = new Set<string>(words);
  for (const w of words) for (const group of VARIANTS) if (group.includes(w)) group.forEach((g) => out.add(g));
  return [...out];
}
function textMatch(terms: string[], fields: string[]) {
  return { OR: terms.flatMap((t) => fields.map((f) => ({ [f]: { contains: t, mode: 'insensitive' as const } }))) };
}

const publicVendor = { where: { status: 'APPROVED' as const } };
const listQuery = z.object({
  category: z.string().optional(),
  occasion: z.string().optional(),
  vendor: z.string().optional(),
  q: z.string().max(100).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  cursor: z.string().optional(),
});

export async function catalogRoutes(app: FastifyInstance) {
  app.get('/occasions', async () => prisma.occasion.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }));
  app.get('/categories', async (req) => {
    const { kind } = parse(z.object({ kind: z.enum(['PRODUCT', 'SERVICE']).optional() }), req.query);
    return prisma.category.findMany({ where: { isActive: true, kind }, orderBy: { sortOrder: 'asc' } });
  });
  app.get('/zones', async () => prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }));

  app.get('/products', async (req) => {
    const q = parse(listQuery, req.query);
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      vendor: { status: 'APPROVED', ...(q.vendor ? { slug: q.vendor } : {}) },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.occasion ? { occasions: { some: { slug: q.occasion } } } : {}),
      ...(q.minPrice || q.maxPrice ? { variants: { some: { isActive: true, pricePaisa: { gte: q.minPrice, lte: q.maxPrice } } } } : {}),
      ...(q.q ? textMatch(expandQuery(q.q), ['title', 'titleUr', 'description']) : {}),
    };
    const items = await prisma.product.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { slug: true, name: true, nameUr: true, isVerified: true, isDemo: true, ratingAvg: true } },
        variants: { where: { isActive: true }, orderBy: { pricePaisa: 'asc' }, take: 1 },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    const next = items.length > q.limit ? items.pop()!.id : null;
    return { items: items.map((p) => ({ ...p, fromPricePaisa: p.variants[0]?.pricePaisa ?? null })), nextCursor: next };
  });

  app.get('/products/:vendorSlug/:slug', async (req) => {
    const { vendorSlug, slug } = req.params as { vendorSlug: string; slug: string };
    const p = await prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', vendor: { slug: vendorSlug, status: 'APPROVED' } },
      include: {
        vendor: { select: { id: true, slug: true, name: true, nameUr: true, isVerified: true, isDemo: true, ratingAvg: true, ratingCount: true } },
        variants: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        images: { orderBy: { sortOrder: 'asc' } },
        customizations: { orderBy: { sortOrder: 'asc' } },
        occasions: true,
        category: true,
      },
    });
    if (!p) throw notFound('Product');
    return p;
  });

  app.get('/products/:id/delivery-slots', async (req) => {
    const { id } = req.params as { id: string };
    const { zone, date } = parse(z.object({ zone: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) throw notFound('Product');
    return { date, slots: await availableSlots({ vendorId: p.vendorId, zoneId: zone, ymd: date, leadTimeMinutes: p.leadTimeMinutes }) };
  });

  app.get('/services', async (req) => {
    const q = parse(listQuery.extend({ area: z.string().optional() }), req.query);
    const where: Prisma.ServiceWhereInput = {
      status: 'ACTIVE',
      vendor: { status: 'APPROVED', ...(q.vendor ? { slug: q.vendor } : {}) },
      ...(q.category ? { category: { slug: q.category } } : {}),
      ...(q.occasion ? { occasions: { some: { slug: q.occasion } } } : {}),
      ...(q.area ? { serviceAreas: { has: q.area } } : {}),
      ...(q.q ? textMatch(expandQuery(q.q), ['title', 'titleUr', 'description']) : {}),
    };
    const items = await prisma.service.findMany({
      where,
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { slug: true, name: true, nameUr: true, isVerified: true, isDemo: true, ratingAvg: true } },
        packages: { where: { isActive: true }, orderBy: { pricePaisa: 'asc' }, take: 1 },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
    });
    const next = items.length > q.limit ? items.pop()!.id : null;
    return { items: items.map((s) => ({ ...s, fromPricePaisa: s.packages[0]?.pricePaisa ?? null })), nextCursor: next };
  });

  app.get('/services/:vendorSlug/:slug', async (req) => {
    const { vendorSlug, slug } = req.params as { vendorSlug: string; slug: string };
    const s = await prisma.service.findFirst({
      where: { slug, status: 'ACTIVE', vendor: { slug: vendorSlug, status: 'APPROVED' } },
      include: {
        vendor: { select: { id: true, slug: true, name: true, nameUr: true, isVerified: true, isDemo: true, ratingAvg: true } },
        packages: { where: { isActive: true }, orderBy: { sortOrder: 'asc' }, include: { cancellationPolicy: true } },
        images: true,
        occasions: true,
        category: true,
      },
    });
    if (!s) throw notFound('Service');
    return s;
  });

  /** Dates in a month with remaining capacity for this service. */
  app.get('/services/:id/availability', async (req) => {
    const { id } = req.params as { id: string };
    const { month } = parse(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }), req.query);
    const s = await prisma.service.findUnique({ where: { id } });
    if (!s) throw notFound('Service');
    const start = dateOnly(`${month}-01`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const [bookings, blackouts] = await Promise.all([
      prisma.booking.findMany({
        where: { serviceId: id, eventStart: { gte: new Date(start.getTime() - 5 * 3600_000), lt: end }, status: { in: ['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'RESCHEDULE_REQUESTED', 'FULLY_PAID'] } },
        select: { eventStart: true },
      }),
      prisma.vendorBlackout.findMany({ where: { vendorId: s.vendorId, date: { gte: start, lt: end }, OR: [{ serviceId: null }, { serviceId: id }] } }),
    ]);
    const count = new Map<string, number>();
    for (const b of bookings) {
      const d = new Date(b.eventStart.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
      count.set(d, (count.get(d) ?? 0) + 1);
    }
    const closed = new Set(blackouts.map((b) => b.date.toISOString().slice(0, 10)));
    const days: { date: string; available: boolean; remaining: number }[] = [];
    for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86_400_000)) {
      const ymd = d.toISOString().slice(0, 10);
      const remaining = closed.has(ymd) ? 0 : Math.max(0, s.maxBookingsPerDay - (count.get(ymd) ?? 0));
      days.push({ date: ymd, available: remaining > 0, remaining });
    }
    return { month, days };
  });

  app.get('/vendors/:slug', async (req) => {
    const { slug } = req.params as { slug: string };
    const v = await prisma.vendor.findFirst({
      where: { slug, ...publicVendor.where },
      select: {
        id: true, slug: true, name: true, nameUr: true, kind: true, tagline: true, description: true, descriptionUr: true,
        logoUrl: true, coverUrl: true, isVerified: true, isDemo: true, ratingAvg: true, ratingCount: true,
        products: { where: { status: 'ACTIVE' }, select: { id: true, slug: true, title: true, titleUr: true } },
        services: { where: { status: 'ACTIVE' }, select: { id: true, slug: true, title: true, titleUr: true } },
        deliveryZones: { where: { isActive: true }, select: { chargePaisa: true, minOrderPaisa: true, zone: { select: { id: true, name: true, nameUr: true } } } },
      },
    });
    if (!v) throw notFound('Vendor');
    return v;
  });

  app.get('/vendors/:slug/reviews', async (req) => {
    const { slug } = req.params as { slug: string };
    return prisma.review.findMany({
      where: { vendor: { slug }, isHidden: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { rating: true, text: true, photoUrls: true, createdAt: true, customer: { select: { name: true } } },
    });
  });

  app.get('/search', async (req) => {
    const { q } = parse(z.object({ q: z.string().min(1).max(100) }), req.query);
    const terms = expandQuery(q);
    const [products, services, vendors] = await Promise.all([
      prisma.product.findMany({ where: { status: 'ACTIVE', vendor: publicVendor.where, ...textMatch(terms, ['title', 'titleUr', 'description']) }, take: 12, select: { id: true, slug: true, title: true, titleUr: true, isDemo: true, vendor: { select: { slug: true, name: true } } } }),
      prisma.service.findMany({ where: { status: 'ACTIVE', vendor: publicVendor.where, ...textMatch(terms, ['title', 'titleUr', 'description']) }, take: 12, select: { id: true, slug: true, title: true, titleUr: true, isDemo: true, vendor: { select: { slug: true, name: true } } } }),
      prisma.vendor.findMany({ where: { ...publicVendor.where, ...textMatch(terms, ['name', 'nameUr', 'tagline']) }, take: 8, select: { slug: true, name: true, nameUr: true, isDemo: true, isVerified: true } }),
    ]);
    return { q, terms, products, services, vendors };
  });
}
