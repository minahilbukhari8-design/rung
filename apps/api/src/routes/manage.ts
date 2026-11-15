import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { ApiError, badRequest, conflict, notFound, parse, prisma, requireAdmin, requireUser, requireVendor } from '../lib/core.js';
import { expireUnansweredOrders, isUniqueViolation } from '../lib/orders.js';
import { expireBookings } from './bookings.js';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase-with-dashes').max(80);

/** Time-based work: orders a vendor never answered, booking requests that ran out of time. Safe to run often. */
export async function runScheduledJobs(adapters: Adapters) {
  return { ordersRejected: await expireUnansweredOrders(adapters), bookingsExpired: await expireBookings() };
}

export async function manageRoutes(app: FastifyInstance, adapters: Adapters) {
  // ---------- vendor onboarding ----------
  app.post('/vendor/apply', async (req, reply) => {
    const u = requireUser(req);
    const body = parse(
      z.object({ slug, name: z.string().min(2).max(80), nameUr: z.string().max(80).optional(), kind: z.enum(['PRODUCTS', 'SERVICES', 'BOTH']), phone: z.string().min(10), description: z.string().max(2000).optional() }),
      req.body,
    );
    if (await prisma.vendorMember.findFirst({ where: { userId: u.id } })) throw conflict('ALREADY_VENDOR', 'You already have a vendor account');
    try {
      const vendor = await prisma.$transaction(async (tx) => {
        const v = await tx.vendor.create({ data: { ...body, members: { create: { userId: u.id, role: 'OWNER' } } } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: u.id } });
        if (!user.roles.includes('VENDOR')) await tx.user.update({ where: { id: u.id }, data: { roles: { push: 'VENDOR' } } });
        return v;
      });
      reply.code(201);
      return vendor;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('SLUG_TAKEN', 'That shop link is taken');
      throw e;
    }
  });

  app.get('/vendor/profile', async (req) => (await requireVendor(req)).vendor);

  app.put('/vendor/zones', async (req) => {
    const { vendor } = await requireVendor(req, true);
    const zones = parse(z.array(z.object({ zoneId: z.string(), chargePaisa: z.number().int().nonnegative(), minOrderPaisa: z.number().int().nonnegative().default(0), sameDayCutoffMinute: z.number().int().min(0).max(1439).nullable().default(null) })), req.body);
    await prisma.$transaction([
      prisma.vendorDeliveryZone.deleteMany({ where: { vendorId: vendor.id } }),
      prisma.vendorDeliveryZone.createMany({ data: zones.map((z) => ({ ...z, vendorId: vendor.id })) }),
    ]);
    return prisma.vendorDeliveryZone.findMany({ where: { vendorId: vendor.id } });
  });

  app.put('/vendor/slots', async (req) => {
    const { vendor } = await requireVendor(req, true);
    const slots = parse(
      z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), capacity: z.number().int().min(1).max(500) })).refine((a) => a.every((s) => s.endMinute > s.startMinute), 'endMinute must be after startMinute'),
      req.body,
    );
    await prisma.$transaction([
      prisma.vendorDeliverySlot.deleteMany({ where: { vendorId: vendor.id } }),
      prisma.vendorDeliverySlot.createMany({ data: slots.map((s) => ({ ...s, vendorId: vendor.id })) }),
    ]);
    return prisma.vendorDeliverySlot.findMany({ where: { vendorId: vendor.id }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] });
  });

  app.post('/vendor/products', async (req, reply) => {
    const { vendor } = await requireVendor(req);
    const body = parse(
      z.object({
        slug, title: z.string().min(2).max(120), titleUr: z.string().max(120).optional(), description: z.string().max(4000).optional(),
        categoryId: z.string(), occasionIds: z.array(z.string()).default([]), leadTimeMinutes: z.number().int().min(0).max(14 * 1440).default(0),
        status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
        variants: z.array(z.object({ name: z.string().min(1), sku: z.string().optional(), pricePaisa: z.number().int().positive(), stock: z.number().int().min(0).default(0), trackInventory: z.boolean().default(true), attributes: z.record(z.string(), z.string()).default({}) })).min(1),
        customizations: z.array(z.object({ label: z.string(), type: z.enum(['TEXT', 'IMAGE', 'CHOICE']), isRequired: z.boolean().default(false), maxLength: z.number().int().positive().optional(), extraPricePaisa: z.number().int().min(0).default(0), choices: z.array(z.object({ value: z.string(), label: z.string(), extraPaisa: z.number().int().min(0).default(0) })).optional() })).default([]),
      }),
      req.body,
    );
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || cat.kind !== 'PRODUCT') throw badRequest('BAD_CATEGORY', 'Pick a product category');
    if (body.status === 'ACTIVE' && vendor.status !== 'APPROVED') throw conflict('VENDOR_NOT_APPROVED', 'Listings go live after your shop is approved');
    try {
      const p = await prisma.product.create({
        data: {
          vendorId: vendor.id, slug: body.slug, title: body.title, titleUr: body.titleUr, description: body.description, categoryId: body.categoryId,
          leadTimeMinutes: body.leadTimeMinutes, status: body.status, isCustomizable: body.customizations.length > 0, isDemo: vendor.isDemo,
          occasions: { connect: body.occasionIds.map((id) => ({ id })) },
          variants: { create: body.variants.map((v, i) => ({ ...v, sortOrder: i })) },
          customizations: { create: body.customizations.map((c, i) => ({ ...c, sortOrder: i })) },
        },
        include: { variants: true, customizations: true },
      });
      reply.code(201);
      return p;
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('SLUG_TAKEN', 'You already have a product with that link');
      throw e;
    }
  });

  app.patch('/vendor/variants/:id', async (req) => {
    const { vendor } = await requireVendor(req);
    const { id } = req.params as { id: string };
    const body = parse(z.object({ pricePaisa: z.number().int().positive().optional(), stock: z.number().int().min(0).optional(), isActive: z.boolean().optional() }), req.body);
    const r = await prisma.productVariant.updateMany({ where: { id, product: { vendorId: vendor.id } }, data: body });
    if (!r.count) throw notFound('Variant');
    return prisma.productVariant.findUniqueOrThrow({ where: { id } });
  });

  app.post('/vendor/services', async (req, reply) => {
    const { vendor } = await requireVendor(req);
    const body = parse(
      z.object({
        slug, title: z.string().min(2).max(120), titleUr: z.string().max(120).optional(), description: z.string().max(4000).optional(),
        categoryId: z.string(), occasionIds: z.array(z.string()).default([]), maxBookingsPerDay: z.number().int().min(1).max(50).default(1),
        serviceAreas: z.array(z.string()).default([]), status: z.enum(['DRAFT', 'ACTIVE']).default('DRAFT'),
        cancellationTiers: z.array(z.object({ hoursBefore: z.number().int().min(0), refundBps: z.number().int().min(0).max(10000) })).min(1),
        packages: z.array(z.object({ name: z.string().min(1), inclusions: z.array(z.string()).default([]), pricePaisa: z.number().int().positive(), advanceBps: z.number().int().min(0).max(10000).default(3000), minGuests: z.number().int().positive().optional(), maxGuests: z.number().int().positive().optional(), durationMinutes: z.number().int().positive().optional() })).min(1),
      }),
      req.body,
    );
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat || cat.kind !== 'SERVICE') throw badRequest('BAD_CATEGORY', 'Pick a service category');
    if (body.status === 'ACTIVE' && vendor.status !== 'APPROVED') throw conflict('VENDOR_NOT_APPROVED', 'Listings go live after your shop is approved');
    const svc = await prisma.$transaction(async (tx) => {
      const policy = await tx.cancellationPolicy.create({ data: { vendorId: vendor.id, name: `${body.title} policy`, tiers: body.cancellationTiers } });
      return tx.service.create({
        data: {
          vendorId: vendor.id, slug: body.slug, title: body.title, titleUr: body.titleUr, description: body.description, categoryId: body.categoryId,
          maxBookingsPerDay: body.maxBookingsPerDay, serviceAreas: body.serviceAreas, status: body.status, isDemo: vendor.isDemo,
          occasions: { connect: body.occasionIds.map((id) => ({ id })) },
          packages: { create: body.packages.map((p, i) => ({ ...p, sortOrder: i, cancellationPolicyId: policy.id })) },
        },
        include: { packages: true },
      });
    });
    reply.code(201);
    return svc;
  });

  // ---------- admin ----------
  app.get('/admin/vendors', async (req) => {
    await requireAdmin(req, 'OPS');
    const { status } = parse(z.object({ status: z.enum(['PENDING_REVIEW', 'APPROVED', 'SUSPENDED', 'REJECTED']).optional() }), req.query);
    return prisma.vendor.findMany({ where: { status }, orderBy: { createdAt: 'asc' }, include: { documents: true } });
  });

  app.post('/admin/vendors/:id/:action', async (req) => {
    const admin = await requireAdmin(req, 'OPS');
    const { id, action } = req.params as { id: string; action: string };
    const { reason, commissionBps } = parse(z.object({ reason: z.string().max(300).optional(), commissionBps: z.number().int().min(0).max(5000).optional() }), req.body ?? {});
    const status = ({ approve: 'APPROVED', reject: 'REJECTED', suspend: 'SUSPENDED' } as const)[action as 'approve'];
    if (!status) throw notFound('Action');
    if (status !== 'APPROVED' && !reason) throw badRequest('REASON_REQUIRED', 'A reason is required');
    const v = await prisma.vendor.update({ where: { id }, data: { status, ...(status === 'APPROVED' ? { approvedAt: new Date() } : {}), ...(commissionBps !== undefined ? { commissionBps } : {}) } }).catch(() => null);
    if (!v) throw notFound('Vendor');
    await prisma.auditLog.create({ data: { actorId: admin.id, action: `vendor.${action}`, entity: 'Vendor', entityId: id, data: { reason, commissionBps }, ip: req.ip } });
    return v;
  });

  /** Runs time-based expiries. In production this is called by a scheduler every few minutes. */
  app.post('/admin/jobs/expire', async (req) => {
    await requireAdmin(req, 'OPS');
    return runScheduledJobs(adapters);
  });

  /** For an outside scheduler (GitHub Actions on free hosting). Needs the JOBS_TOKEN secret in the x-jobs-token header. */
  app.post('/jobs/run', async (req) => {
    const want = process.env.JOBS_TOKEN;
    const got = req.headers['x-jobs-token'];
    if (!want || want.length < 24 || typeof got !== 'string' || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
      throw new ApiError(401, 'BAD_JOBS_TOKEN', 'Not allowed');
    }
    return runScheduledJobs(adapters);
  });

  app.get('/admin/audit-log', async (req) => {
    await requireAdmin(req);
    const { entity, entityId } = parse(z.object({ entity: z.string().max(40).optional(), entityId: z.string().max(40).optional() }), req.query);
    return prisma.auditLog.findMany({ where: { entity, entityId }, orderBy: { createdAt: 'desc' }, take: 200, include: { actor: { select: { phone: true, name: true } } } });
  });
}
