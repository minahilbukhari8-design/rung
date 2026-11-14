import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizePkMobile } from '@rung/domain';
import type { Adapters } from '../adapters/index.js';
import { ApiError, badRequest, conflict, forbidden, notFound, parse, prisma, requireUser, requireVendor } from '../lib/core.js';
import { dateOnly } from '../lib/slots.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function vendorRoutes(app: FastifyInstance, adapters: Adapters) {
  const storage = () => {
    if (!adapters.storage) throw new ApiError(503, 'STORAGE_UNAVAILABLE', 'File storage is not configured');
    return adapters.storage;
  };

  // ---------- uploads ----------
  /** Small uploads as base64 JSON. KYC and payment proofs are private; listing images are public. */
  app.post('/uploads', { bodyLimit: 8 * 1024 * 1024 }, async (req, reply) => {
    const u = requireUser(req);
    const body = parse(z.object({ purpose: z.enum(['KYC', 'PAYMENT_PROOF', 'DELIVERY_PROOF', 'LISTING_IMAGE']), contentType: z.string(), dataBase64: z.string().min(4) }), req.body);
    if (!ALLOWED_TYPES.includes(body.contentType)) throw badRequest('BAD_FILE_TYPE', 'Upload a JPG, PNG, WebP or PDF');
    if (body.purpose === 'LISTING_IMAGE' && body.contentType === 'application/pdf') throw badRequest('BAD_FILE_TYPE', 'Listing images must be pictures');
    const data = Buffer.from(body.dataBase64, 'base64');
    if (data.length === 0 || data.length > MAX_UPLOAD_BYTES) throw badRequest('FILE_TOO_LARGE', 'Files must be under 5 MB');
    // check magic bytes so a renamed file can't pretend to be an image
    const sig = data.subarray(0, 4).toString('hex');
    const ok = (body.contentType === 'image/png' && sig === '89504e47') || (body.contentType === 'image/jpeg' && sig.startsWith('ffd8ff')) || (body.contentType === 'application/pdf' && sig === '25504446') || (body.contentType === 'image/webp' && data.subarray(8, 12).toString() === 'WEBP');
    if (!ok) throw badRequest('BAD_FILE_TYPE', 'File content does not match its type');
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[body.contentType];
    const isPublic = body.purpose === 'LISTING_IMAGE' || body.purpose === 'DELIVERY_PROOF';
    const key = `${isPublic ? 'public' : 'private'}/${u.id}/${randomUUID()}.${ext}`;
    await storage().put(key, data, body.contentType);
    reply.code(201);
    return { key, url: `/api/v1/files/${key}` };
  });

  app.get('/files/*', async (req, reply) => {
    const key = (req.params as { '*': string })['*'];
    if (!/^(public|private)\/[a-z0-9]+\/[0-9a-f-]+\.(jpg|png|webp|pdf)$/.test(key)) throw notFound('File');
    if (key.startsWith('private/')) {
      const u = requireUser(req);
      const owner = key.split('/')[1];
      const me = await prisma.user.findUnique({ where: { id: u.id } });
      if (owner !== u.id && !me?.roles.includes('ADMIN')) throw notFound('File');
    }
    const f = await storage().get(key);
    if (!f) throw notFound('File');
    reply.header('content-type', f.contentType).header('cache-control', key.startsWith('public/') ? 'public, max-age=86400' : 'private, no-store');
    return reply.send(f.data);
  });

  // ---------- vendor account ----------
  app.get('/vendor/me', async (req) => {
    const u = requireUser(req);
    const m = await prisma.vendorMember.findFirst({ where: { userId: u.id }, include: { vendor: { include: { documents: { orderBy: { createdAt: 'desc' } } } } } });
    return m ? { vendor: m.vendor, role: m.role } : { vendor: null, role: null };
  });

  app.patch('/vendor/profile', async (req) => {
    const { vendor } = await requireVendor(req, true);
    const data = parse(
      z.object({
        name: z.string().min(2).max(80).optional(), nameUr: z.string().max(80).optional(), tagline: z.string().max(140).optional(),
        description: z.string().max(2000).optional(), descriptionUr: z.string().max(2000).optional(), whatsapp: z.string().optional(), email: z.string().email().optional(), baseAddress: z.string().max(200).optional(),
      }),
      req.body,
    );
    return prisma.vendor.update({ where: { id: vendor.id }, data });
  });

  app.get('/vendor/documents', async (req) => {
    const { vendor } = await requireVendor(req, true);
    return prisma.vendorDocument.findMany({ where: { vendorId: vendor.id }, orderBy: { createdAt: 'desc' } });
  });

  app.post('/vendor/documents', async (req, reply) => {
    const { vendor, user } = await requireVendor(req, true);
    const body = parse(z.object({ type: z.enum(['CNIC_FRONT', 'CNIC_BACK', 'NTN_CERTIFICATE', 'BUSINESS_REGISTRATION', 'BANK_PROOF', 'OTHER']), key: z.string() }), req.body);
    if (!body.key.startsWith(`private/${user.id}/`)) throw badRequest('BAD_KEY', 'Upload the document first');
    reply.code(201);
    return prisma.vendorDocument.create({ data: { vendorId: vendor.id, type: body.type, storageKey: body.key } });
  });

  // ---------- listings ----------
  app.get('/vendor/products', async (req) => {
    const { vendor } = await requireVendor(req);
    return prisma.product.findMany({ where: { vendorId: vendor.id, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, include: { variants: { orderBy: { sortOrder: 'asc' } }, images: true, category: true } });
  });

  app.patch('/vendor/products/:id', async (req) => {
    const { vendor } = await requireVendor(req);
    const { id } = req.params as { id: string };
    const data = parse(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(), title: z.string().min(2).max(120).optional(), titleUr: z.string().max(120).optional(), description: z.string().max(4000).optional(), leadTimeMinutes: z.number().int().min(0).optional() }), req.body);
    if (data.status === 'ACTIVE' && vendor.status !== 'APPROVED') throw conflict('VENDOR_NOT_APPROVED', 'Listings go live after your shop is approved');
    const r = await prisma.product.updateMany({ where: { id, vendorId: vendor.id }, data });
    if (!r.count) throw notFound('Product');
    return prisma.product.findUniqueOrThrow({ where: { id }, include: { variants: true } });
  });

  app.post('/vendor/products/:id/images', async (req, reply) => {
    const { vendor, user } = await requireVendor(req);
    const { id } = req.params as { id: string };
    const { key, alt } = parse(z.object({ key: z.string(), alt: z.string().max(120).optional() }), req.body);
    if (!key.startsWith(`public/${user.id}/`)) throw badRequest('BAD_KEY', 'Upload the image first');
    const p = await prisma.product.findFirst({ where: { id, vendorId: vendor.id }, include: { images: true } });
    if (!p) throw notFound('Product');
    reply.code(201);
    return prisma.productImage.create({ data: { productId: id, url: `/api/v1/files/${key}`, alt, sortOrder: p.images.length } });
  });

  app.get('/vendor/services', async (req) => {
    const { vendor } = await requireVendor(req);
    return prisma.service.findMany({ where: { vendorId: vendor.id, status: { not: 'ARCHIVED' } }, orderBy: { createdAt: 'desc' }, include: { packages: { orderBy: { sortOrder: 'asc' }, include: { cancellationPolicy: true } }, category: true } });
  });

  app.patch('/vendor/services/:id', async (req) => {
    const { vendor } = await requireVendor(req);
    const { id } = req.params as { id: string };
    const data = parse(z.object({ status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(), maxBookingsPerDay: z.number().int().min(1).max(50).optional(), serviceAreas: z.array(z.string()).optional() }), req.body);
    if (data.status === 'ACTIVE' && vendor.status !== 'APPROVED') throw conflict('VENDOR_NOT_APPROVED', 'Listings go live after your shop is approved');
    const r = await prisma.service.updateMany({ where: { id, vendorId: vendor.id }, data });
    if (!r.count) throw notFound('Service');
    return prisma.service.findUniqueOrThrow({ where: { id }, include: { packages: true } });
  });

  app.patch('/vendor/packages/:id', async (req) => {
    const { vendor } = await requireVendor(req);
    const { id } = req.params as { id: string };
    const data = parse(z.object({ pricePaisa: z.number().int().positive().optional(), advanceBps: z.number().int().min(0).max(10000).optional(), isActive: z.boolean().optional() }), req.body);
    const r = await prisma.servicePackage.updateMany({ where: { id, service: { vendorId: vendor.id } }, data });
    if (!r.count) throw notFound('Package');
    return prisma.servicePackage.findUniqueOrThrow({ where: { id } });
  });

  // ---------- logistics ----------
  app.get('/vendor/zones', async (req) => {
    const { vendor } = await requireVendor(req);
    return prisma.vendorDeliveryZone.findMany({ where: { vendorId: vendor.id }, include: { zone: true } });
  });
  app.get('/vendor/slots', async (req) => {
    const { vendor } = await requireVendor(req);
    return prisma.vendorDeliverySlot.findMany({ where: { vendorId: vendor.id }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] });
  });

  app.get('/vendor/blackouts', async (req) => {
    const { vendor } = await requireVendor(req);
    return prisma.vendorBlackout.findMany({ where: { vendorId: vendor.id, date: { gte: dateOnly(new Date().toISOString().slice(0, 10)) } }, orderBy: { date: 'asc' } });
  });
  app.post('/vendor/blackouts', async (req, reply) => {
    const { vendor } = await requireVendor(req);
    const body = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), reason: z.string().max(140).optional(), serviceId: z.string().optional() }), req.body);
    if (body.serviceId && !(await prisma.service.findFirst({ where: { id: body.serviceId, vendorId: vendor.id } }))) throw notFound('Service');
    reply.code(201);
    return prisma.vendorBlackout.create({ data: { vendorId: vendor.id, date: dateOnly(body.date), reason: body.reason, serviceId: body.serviceId } });
  });
  app.delete('/vendor/blackouts/:id', async (req) => {
    const { vendor } = await requireVendor(req);
    const { id } = req.params as { id: string };
    return { deleted: (await prisma.vendorBlackout.deleteMany({ where: { id, vendorId: vendor.id } })).count };
  });

  // ---------- staff ----------
  app.get('/vendor/staff', async (req) => {
    const { vendor } = await requireVendor(req, true);
    return prisma.vendorMember.findMany({ where: { vendorId: vendor.id }, include: { user: { select: { phone: true, name: true } } } });
  });
  app.post('/vendor/staff', async (req, reply) => {
    const { vendor } = await requireVendor(req, true);
    const { phone } = parse(z.object({ phone: z.string() }), req.body);
    const e164 = normalizePkMobile(phone);
    if (!e164) throw badRequest('BAD_PHONE', 'Enter a Pakistani mobile number');
    const user = await prisma.user.upsert({ where: { phone: e164 }, update: {}, create: { phone: e164 } });
    if (await prisma.vendorMember.findFirst({ where: { userId: user.id } })) throw conflict('ALREADY_MEMBER', 'This number already belongs to a shop');
    await prisma.user.update({ where: { id: user.id }, data: { roles: user.roles.includes('VENDOR') ? undefined : { push: 'VENDOR' } } });
    reply.code(201);
    return prisma.vendorMember.create({ data: { vendorId: vendor.id, userId: user.id, role: 'STAFF' } });
  });
  app.delete('/vendor/staff/:memberId', async (req) => {
    const { vendor, user } = await requireVendor(req, true);
    const { memberId } = req.params as { memberId: string };
    const m = await prisma.vendorMember.findFirst({ where: { id: memberId, vendorId: vendor.id } });
    if (!m) throw notFound('Staff member');
    if (m.userId === user.id) throw forbidden('You cannot remove yourself');
    await prisma.vendorMember.delete({ where: { id: memberId } });
    return { ok: true };
  });

  // ---------- dashboard numbers ----------
  app.get('/vendor/stats', async (req) => {
    const { vendor } = await requireVendor(req);
    const [orders, bookings, lowStock] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where: { vendorId: vendor.id }, _count: { _all: true } }),
      prisma.booking.groupBy({ by: ['status'], where: { vendorId: vendor.id }, _count: { _all: true } }),
      prisma.productVariant.count({ where: { product: { vendorId: vendor.id, status: 'ACTIVE' }, trackInventory: true, isActive: true, stock: { lte: 2 } } }),
    ]);
    return {
      orders: Object.fromEntries(orders.map((o) => [o.status, o._count._all])),
      bookings: Object.fromEntries(bookings.map((b) => [b.status, b._count._all])),
      lowStockVariants: lowStock,
    };
  });

  /** What the vendor has earned (after RUNG commission) and payout history. Only owners see money. */
  app.get('/vendor/earnings', async (req) => {
    const { vendor } = await requireVendor(req, true);
    const [delivered, bookings, payouts] = await Promise.all([
      prisma.order.aggregate({ where: { vendorId: vendor.id, status: 'DELIVERED' }, _sum: { totalPaisa: true, commissionPaisa: true }, _count: { _all: true } }),
      prisma.booking.aggregate({ where: { vendorId: vendor.id, status: { in: ['CONFIRMED', 'COMPLETED', 'FULLY_PAID', 'RESCHEDULE_REQUESTED'] } }, _sum: { paidPaisa: true, commissionPaisa: true }, _count: { _all: true } }),
      prisma.payout.findMany({ where: { vendorId: vendor.id }, orderBy: { periodEnd: 'desc' } }),
    ]);
    const ordersNet = (delivered._sum.totalPaisa ?? 0) - (delivered._sum.commissionPaisa ?? 0);
    const bookingsPaid = bookings._sum.paidPaisa ?? 0;
    const paidOut = payouts.filter((p) => p.status === 'PAID').reduce((a, p) => a + p.netPaisa, 0);
    return {
      orders: { count: delivered._count._all, grossPaisa: delivered._sum.totalPaisa ?? 0, commissionPaisa: delivered._sum.commissionPaisa ?? 0, netPaisa: ordersNet },
      bookings: { count: bookings._count._all, collectedPaisa: bookingsPaid, commissionPaisa: bookings._sum.commissionPaisa ?? 0 },
      paidOutPaisa: paidOut,
      payouts,
      note: 'Commission on bookings is deducted at payout. Payouts are made by bank transfer once RUNG’s business account exists.',
    };
  });
}
