import type { PaymentProvider, Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { settlePayment } from '../lib/payments.js';
import { paymentStartUrl } from './payments.js';
import { ApiError, badRequest, conflict, humanNumber, notFound, parse, prisma, requireUser, requireVendor } from '../lib/core.js';
import { isUniqueViolation, ORDER_VENDOR_SLA_MIN, transitionOrder } from '../lib/orders.js';
import { availableSlots, dateOnly } from '../lib/slots.js';

export const COD_FIRST_ORDER_CAP_PAISA = 500_000; // Rs 5,000 for customers without a delivered order

const customizationValue = z.union([z.string().max(500), z.number()]);
const cartItemSchema = z.object({
  variantId: z.string(),
  quantity: z.number().int().min(1).max(20),
  customization: z.record(z.string(), customizationValue).default({}),
});

const checkoutSchema = z.object({
  provider: z.enum(['COD', 'MOCK', 'BANK_TRANSFER', 'JAZZCASH', 'EASYPAISA']),
  /** where the customer returns after a wallet page: the website or the app */
  client: z.enum(['web', 'app']).default('web'),
  returnTo: z.string().max(300).optional(),
  idempotencyKey: z.string().min(8).max(100),
  senderName: z.string().min(1).max(80),
  groups: z
    .array(
      z.object({
        vendorId: z.string(),
        addressId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        slotStartMinute: z.number().int().min(0).max(1439),
        giftMessage: z.string().max(250).optional(),
        hideSenderName: z.boolean().default(false),
        occasionId: z.string().optional(),
      }),
    )
    .min(1),
});

type CartWithItems = Prisma.CartGetPayload<{
  include: { items: { include: { variant: { include: { product: { include: { customizations: true; vendor: { select: { name: true; nameUr: true; isDemo: true } } } } } } } } };
}>;

/** Validates customization against the product options and returns the surcharge per unit. */
function customizationExtras(item: CartWithItems['items'][number]): number {
  const opts = item.variant.product.customizations;
  const values = item.customization as Record<string, string | number>;
  let extra = 0;
  for (const o of opts) {
    const v = values[o.id];
    const has = v !== undefined && v !== '';
    if (o.isRequired && !has) throw badRequest('CUSTOMIZATION_REQUIRED', `"${o.label}" is required for ${item.variant.product.title}`);
    if (!has) continue;
    if (o.type === 'TEXT' && o.maxLength && String(v).length > o.maxLength) throw badRequest('CUSTOMIZATION_TOO_LONG', `"${o.label}" max ${o.maxLength} characters`);
    if (o.type === 'CHOICE') {
      const choices = (o.choices as { value: string; extraPaisa?: number }[] | null) ?? [];
      const c = choices.find((x) => x.value === v);
      if (!c) throw badRequest('CUSTOMIZATION_INVALID', `Invalid choice for "${o.label}"`);
      extra += c.extraPaisa ?? 0;
    }
    extra += o.extraPricePaisa;
  }
  for (const k of Object.keys(values)) if (!opts.some((o) => o.id === k)) throw badRequest('CUSTOMIZATION_UNKNOWN', `Unknown option ${k}`);
  return extra;
}

async function loadCart(userId: string) {
  return prisma.cart.findUnique({
    where: { userId },
    include: { items: { orderBy: { createdAt: 'asc' }, include: { variant: { include: { product: { include: { customizations: true, vendor: { select: { name: true, nameUr: true, isDemo: true } } } } } } } } },
  });
}

/** Builds the full priced plan for a checkout without writing anything. */
async function buildPlan(userId: string, input: z.infer<typeof checkoutSchema>, now = new Date()) {
  const cart = await loadCart(userId);
  if (!cart || cart.items.length === 0) throw badRequest('CART_EMPTY', 'Your cart is empty');
  const byVendor = new Map<string, CartWithItems['items']>();
  for (const it of cart.items) {
    const p = it.variant.product;
    if (p.status !== 'ACTIVE' || !it.variant.isActive) throw conflict('ITEM_UNAVAILABLE', `${p.title} is no longer available`);
    byVendor.set(p.vendorId, [...(byVendor.get(p.vendorId) ?? []), it]);
  }
  const specVendors = new Set(input.groups.map((g) => g.vendorId));
  if (specVendors.size !== input.groups.length || [...byVendor.keys()].some((v) => !specVendors.has(v)) || [...specVendors].some((v) => !byVendor.has(v))) {
    throw badRequest('GROUPS_MISMATCH', 'Provide exactly one delivery choice per vendor in the cart');
  }

  const plans = [];
  for (const g of input.groups) {
    const items = byVendor.get(g.vendorId)!;
    const vendor = await prisma.vendor.findUnique({ where: { id: g.vendorId } });
    if (!vendor || vendor.status !== 'APPROVED') throw conflict('VENDOR_UNAVAILABLE', 'Vendor is not accepting orders');
    const address = await prisma.address.findFirst({ where: { id: g.addressId, userId } });
    if (!address) throw notFound('Address');
    if (!address.zoneId) throw badRequest('ADDRESS_NO_ZONE', 'We do not deliver to this area yet');
    const vz = await prisma.vendorDeliveryZone.findUnique({ where: { vendorId_zoneId: { vendorId: vendor.id, zoneId: address.zoneId } } });
    if (!vz?.isActive) throw badRequest('ZONE_NOT_SERVED', `${vendor.name} does not deliver to this area`);
    const lead = Math.max(...items.map((i) => i.variant.product.leadTimeMinutes));
    const slots = await availableSlots({ vendorId: vendor.id, zoneId: address.zoneId, ymd: g.date, leadTimeMinutes: lead, now });
    const slot = slots.find((s) => s.startMinute === g.slotStartMinute);
    if (!slot) throw conflict('SLOT_UNAVAILABLE', 'That delivery slot is no longer available');

    const lines = items.map((it) => {
      if (it.variant.trackInventory && it.variant.stock < it.quantity) throw conflict('OUT_OF_STOCK', `${it.variant.product.title} (${it.variant.name}) has only ${it.variant.stock} left`);
      const extras = customizationExtras(it);
      return { it, extras, lineTotal: (it.variant.pricePaisa + extras) * it.quantity };
    });
    const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
    if (subtotal < vz.minOrderPaisa) throw badRequest('BELOW_MINIMUM', `${vendor.name} minimum order not met`);
    const total = subtotal + vz.chargePaisa;
    plans.push({ g, vendor, address, slot, lines, subtotal, delivery: vz.chargePaisa, total, commission: Math.floor((subtotal * vendor.commissionBps + 5000) / 10000) });
  }
  const grandTotal = plans.reduce((a, p) => a + p.total, 0);
  return { cart: cart!, plans, grandTotal };
}

export async function commerceRoutes(app: FastifyInstance, adapters: Adapters) {
  // ---------- cart ----------
  app.get('/cart', async (req) => {
    const u = requireUser(req);
    return (await loadCart(u.id)) ?? { items: [] };
  });

  app.post('/cart/items', async (req, reply) => {
    const u = requireUser(req);
    const body = parse(cartItemSchema, req.body);
    const v = await prisma.productVariant.findUnique({ where: { id: body.variantId }, include: { product: { include: { vendor: true } } } });
    if (!v || !v.isActive || v.product.status !== 'ACTIVE' || v.product.vendor.status !== 'APPROVED') throw notFound('Product');
    const cart = await prisma.cart.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id } });
    reply.code(201);
    return prisma.cartItem.create({ data: { cartId: cart.id, variantId: v.id, quantity: body.quantity, customization: body.customization } });
  });

  app.patch('/cart/items/:id', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const { quantity } = parse(z.object({ quantity: z.number().int().min(1).max(20) }), req.body);
    const r = await prisma.cartItem.updateMany({ where: { id, cart: { userId: u.id } }, data: { quantity } });
    if (!r.count) throw notFound('Cart item');
    return { ok: true };
  });

  app.delete('/cart/items/:id', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    await prisma.cartItem.deleteMany({ where: { id, cart: { userId: u.id } } });
    return { ok: true };
  });

  // ---------- checkout ----------
  app.post('/checkout/quote', async (req) => {
    const u = requireUser(req);
    const input = parse(checkoutSchema.partial({ provider: true, idempotencyKey: true, senderName: true }).required({ groups: true }), req.body);
    const { plans, grandTotal } = await buildPlan(u.id, { provider: 'COD', idempotencyKey: 'quote-only', senderName: '-', ...input });
    return {
      grandTotalPaisa: grandTotal,
      groups: plans.map((p) => ({ vendorId: p.vendor.id, vendorName: p.vendor.name, subtotalPaisa: p.subtotal, deliveryChargePaisa: p.delivery, totalPaisa: p.total, slot: p.slot })),
    };
  });

  app.post('/checkout', async (req, reply) => {
    const u = requireUser(req);
    const input = parse(checkoutSchema, req.body);

    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey }, include: { orderGroup: { include: { orders: true } } } });
    if (existing) return { groupId: existing.orderGroupId, orders: existing.orderGroup?.orders.map((o) => o.number), payment: { id: existing.id, status: existing.status }, idempotentReplay: true };

    const { cart, plans, grandTotal } = await buildPlan(u.id, input);
    const gw = adapters.payments[input.provider as PaymentProvider];
    if (!gw) throw badRequest('PROVIDER_UNAVAILABLE', 'Payment method not available');

    if (input.provider === 'COD') {
      const delivered = await prisma.order.count({ where: { customerId: u.id, status: 'DELIVERED' } });
      if (delivered === 0 && grandTotal > COD_FIRST_ORDER_CAP_PAISA) throw badRequest('COD_LIMIT', 'Cash on delivery is limited to Rs 5,000 on your first order. Please pay online or reduce the cart.');
    }
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    const now = new Date();
    const initialStatus = input.provider === 'COD' ? 'PLACED' : 'PENDING_PAYMENT';

    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        // reserve stock atomically: fails if another checkout took the last units
        for (const p of plans) for (const l of p.lines) {
          if (!l.it.variant.trackInventory) continue;
          const r = await tx.productVariant.updateMany({ where: { id: l.it.variantId, stock: { gte: l.it.quantity } }, data: { stock: { decrement: l.it.quantity } } });
          if (r.count !== 1) throw conflict('OUT_OF_STOCK', `${l.it.variant.product.title} just sold out`);
        }
        const group = await tx.orderGroup.create({ data: { customerId: u.id, totalPaisa: grandTotal } });
        const orders = [];
        for (const p of plans) {
          orders.push(
            await tx.order.create({
              data: {
                number: humanNumber('RG'), groupId: group.id, customerId: u.id, vendorId: p.vendor.id, occasionId: p.g.occasionId,
                status: initialStatus,
                senderName: input.senderName, senderPhone: user.phone, hideSenderName: p.g.hideSenderName,
                recipientName: p.address.recipientName, recipientPhone: p.address.recipientPhone,
                addressSnapshot: { line1: p.address.line1, line2: p.address.line2, area: p.address.area, city: p.address.city, landmark: p.address.landmark },
                zoneId: p.address.zoneId!, giftMessage: p.g.giftMessage,
                deliveryDate: dateOnly(p.g.date), slotStartMinute: p.slot.startMinute, slotEndMinute: p.slot.endMinute,
                subtotalPaisa: p.subtotal, deliveryChargePaisa: p.delivery, totalPaisa: p.total,
                commissionBps: p.vendor.commissionBps, commissionPaisa: p.commission,
                placedAt: initialStatus === 'PLACED' ? now : null,
                vendorRespondBy: initialStatus === 'PLACED' ? new Date(now.getTime() + ORDER_VENDOR_SLA_MIN * 60_000) : null,
                items: {
                  create: p.lines.map((l) => ({
                    variantId: l.it.variantId, productTitle: l.it.variant.product.title, variantName: l.it.variant.name,
                    unitPricePaisa: l.it.variant.pricePaisa, extrasPaisa: l.extras, quantity: l.it.quantity, lineTotalPaisa: l.lineTotal,
                    customization: l.it.customization as Prisma.InputJsonValue,
                  })),
                },
                events: { create: { to: initialStatus, actorType: 'CUSTOMER', actorId: u.id } },
              },
            }),
          );
        }
        const payment = await tx.payment.create({
          data: { purpose: 'ORDER_GROUP', provider: input.provider, status: 'INITIATED', amountPaisa: grandTotal, orderGroupId: group.id, idempotencyKey: input.idempotencyKey, isSandbox: gw.isSandbox },
        });
        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return { group, orders, payment };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw conflict('DUPLICATE_CHECKOUT', 'This checkout was already submitted');
      throw e;
    }

    // talk to the gateway outside the DB transaction
    let paymentStatus: 'SUCCEEDED' | 'PENDING' | 'FAILED';
    let instructions: string | undefined;
    let redirectUrl: string | undefined;
    try {
      const r = await gw.init({ paymentId: created.payment.id, amountPaisa: grandTotal, description: `RUNG order ${created.orders.map((o) => o.number).join(', ')}` });
      if (r.kind === 'succeeded') {
        paymentStatus = 'SUCCEEDED';
        await settlePayment(adapters, created.payment.id, { status: 'SUCCEEDED', providerRef: r.providerRef });
      } else {
        paymentStatus = 'PENDING';
        if (r.kind === 'pending') instructions = r.instructions;
        if (r.kind === 'redirect') redirectUrl = paymentStartUrl(created.payment.id, input.client);
        await prisma.payment.update({ where: { id: created.payment.id }, data: { status: 'PENDING', ...(r.kind === 'redirect' ? { providerRef: r.providerRef, rawResponse: { client: input.client, returnTo: input.returnTo ?? null } } : {}) } });
      }
    } catch (err) {
      paymentStatus = 'FAILED';
      await prisma.payment.update({ where: { id: created.payment.id }, data: { status: 'FAILED', failureReason: String((err as Error).message) } });
      for (const o of created.orders) await transitionOrder(adapters, { orderNumber: o.number, to: 'CANCELLED', actor: 'SYSTEM', note: 'Payment failed' });
    }

    reply.code(201);
    return {
      groupId: created.group.id,
      grandTotalPaisa: grandTotal,
      orders: created.orders.map((o) => o.number),
      payment: { id: created.payment.id, provider: input.provider, status: paymentStatus, isSandbox: gw.isSandbox, instructions, redirectUrl },
    };
  });

  // ---------- customer orders ----------
  app.get('/orders', async (req) => {
    const u = requireUser(req);
    return prisma.order.findMany({ where: { customerId: u.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { vendor: { select: { name: true, slug: true } }, items: true } });
  });

  app.get('/orders/:number', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const o = await prisma.order.findFirst({ where: { number, customerId: u.id }, include: { items: true, events: { orderBy: { createdAt: 'asc' } }, vendor: { select: { name: true, slug: true, phone: true } }, refunds: true } });
    if (!o) throw notFound('Order');
    return o;
  });

  app.post('/orders/:number/cancel', async (req) => {
    const u = requireUser(req);
    const { number } = req.params as { number: string };
    const { reason } = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
    return transitionOrder(adapters, { orderNumber: number, to: 'CANCELLED', actor: 'CUSTOMER', actorId: u.id, note: reason, customerId: u.id });
  });

  // ---------- vendor orders ----------
  app.get('/vendor/orders', async (req) => {
    const { vendor } = await requireVendor(req);
    const { status } = parse(z.object({ status: z.string().optional() }), req.query);
    return prisma.order.findMany({
      where: { vendorId: vendor.id, ...(status ? { status: status as never } : {}) },
      orderBy: [{ deliveryDate: 'asc' }, { slotStartMinute: 'asc' }],
      take: 100,
      include: { items: true },
    });
  });

  app.post('/vendor/orders/:number/transition', async (req) => {
    const { vendor, user } = await requireVendor(req);
    const { number } = req.params as { number: string };
    const body = parse(z.object({ to: z.enum(['ACCEPTED', 'REJECTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY']), note: z.string().max(300).optional(), photoUrl: z.string().url().optional(), photoKey: z.string().regex(/^public\/[a-z0-9]+\/[0-9a-f-]+\.(jpg|png|webp)$/).optional() }), req.body);
    if (body.photoKey && !body.photoKey.startsWith(`public/${user.id}/`)) throw badRequest('BAD_KEY', 'Upload the photo first');
    const photoUrl = body.photoUrl ?? (body.photoKey ? `/api/v1/files/${body.photoKey}` : undefined);
    return transitionOrder(adapters, { orderNumber: number, to: body.to, actor: 'VENDOR', actorId: user.id, note: body.note, photoUrl, vendorId: vendor.id });
  });

  // ---------- bank transfer proof ----------
  app.post('/payments/:id/proof', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const { proofUrl } = parse(z.object({ proofUrl: z.string().url() }), req.body);
    const p = await prisma.payment.findFirst({ where: { id, provider: 'BANK_TRANSFER', OR: [{ orderGroup: { customerId: u.id } }, { booking: { customerId: u.id } }] } });
    if (!p) throw notFound('Payment');
    if (p.status !== 'PENDING') throw new ApiError(409, 'PAYMENT_NOT_PENDING', 'This payment is not waiting for a receipt');
    return prisma.payment.update({ where: { id }, data: { proofUrl } });
  });

}
