/**
 * Integration test against a real Postgres (DATABASE_URL). Builds one product order and one
 * service booking end to end, then rolls everything back. All rows are flagged isDemo.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

const prisma = new PrismaClient();
afterAll(() => prisma.$disconnect());

class Rollback extends Error {}

describe('schema round-trip (rolled back)', () => {
  it('creates customer, vendor, product order and service booking', async () => {
    let checked = false;
    await prisma
      .$transaction(async (tx) => {
        const customer = await tx.user.create({ data: { phone: '+923000000001', name: 'DEMO Customer', isDemo: true } });
        const owner = await tx.user.create({ data: { phone: '+923000000002', roles: ['VENDOR'], isDemo: true } });
        const vendor = await tx.vendor.create({
          data: {
            slug: 'demo-bakery', name: 'DEMO Bakery', kind: 'BOTH', phone: owner.phone, isDemo: true,
            members: { create: { userId: owner.id, role: 'OWNER' } },
          },
        });
        const zone = await tx.deliveryZone.create({ data: { name: 'DEMO Zone', areas: ['Gulberg'] } });
        await tx.vendorDeliveryZone.create({ data: { vendorId: vendor.id, zoneId: zone.id, chargePaisa: 0 } });
        const cakes = await tx.category.create({ data: { kind: 'PRODUCT', slug: 'demo-cakes', name: 'Cakes', nameUr: 'کیک' } });
        const birthday = await tx.occasion.create({ data: { slug: 'demo-birthday', name: 'Birthday', nameUr: 'سالگرہ', accentToken: 'rani' } });
        const product = await tx.product.create({
          data: {
            vendorId: vendor.id, categoryId: cakes.id, slug: 'demo-cake', title: 'DEMO Cake', isDemo: true, status: 'ACTIVE',
            occasions: { connect: { id: birthday.id } },
            variants: { create: { name: '2 lb', pricePaisa: 1, stock: 5 } }, // DEMO price, not a real price
          },
          include: { variants: true },
        });
        const v = product.variants[0]!;
        const group = await tx.orderGroup.create({ data: { customerId: customer.id, totalPaisa: 1 } });
        const order = await tx.order.create({
          data: {
            number: 'RG-DEMO01', groupId: group.id, customerId: customer.id, vendorId: vendor.id, occasionId: birthday.id,
            senderName: 'DEMO', senderPhone: customer.phone, recipientName: 'DEMO Ammi', recipientPhone: '+923000000003',
            addressSnapshot: { line1: 'DEMO' }, zoneId: zone.id, deliveryDate: new Date('2026-12-01'),
            slotStartMinute: 17 * 60, slotEndMinute: 19 * 60, subtotalPaisa: 1, deliveryChargePaisa: 0, totalPaisa: 1,
            commissionBps: 1200, commissionPaisa: 0,
            items: { create: { variantId: v.id, productTitle: product.title, variantName: v.name, unitPricePaisa: 1, quantity: 1, lineTotalPaisa: 1 } },
            events: { create: { to: 'PENDING_PAYMENT', actorType: 'CUSTOMER', actorId: customer.id } },
          },
        });
        await tx.payment.create({
          data: { purpose: 'ORDER_GROUP', provider: 'MOCK', amountPaisa: 1, orderGroupId: group.id, idempotencyKey: 'demo-1', isSandbox: true },
        });

        const decor = await tx.category.create({ data: { kind: 'SERVICE', slug: 'demo-decor', name: 'Decor', nameUr: 'سجاوٹ' } });
        const service = await tx.service.create({
          data: {
            vendorId: vendor.id, categoryId: decor.id, slug: 'demo-decor', title: 'DEMO Decor', isDemo: true,
            packages: { create: { name: 'DEMO Basic', pricePaisa: 1000, advanceBps: 3000 } },
          },
          include: { packages: true },
        });
        const pkg = service.packages[0]!;
        const booking = await tx.booking.create({
          data: {
            number: 'RB-DEMO01', customerId: customer.id, vendorId: vendor.id, serviceId: service.id, packageId: pkg.id,
            eventStart: new Date('2026-12-20T14:00:00Z'), venueSnapshot: { name: 'DEMO venue' },
            packageName: pkg.name, packagePricePaisa: 1000, totalPaisa: 1000, advanceBps: 3000, advancePaisa: 300,
            remainingPaisa: 700, commissionBps: 1000, commissionPaisa: 100, vendorRespondBy: new Date('2026-11-15T14:00:00Z'),
          },
        });


        const loaded = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, events: true, group: { include: { payments: true } } } });
        expect(loaded.items).toHaveLength(1);
        expect(loaded.group.payments[0]!.isSandbox).toBe(true);
        expect(booking.advancePaisa + booking.remainingPaisa).toBe(booking.totalPaisa);
        // uniqueness: phone numbers (last, because a failed statement aborts the Postgres transaction)
        await expect(tx.user.create({ data: { phone: '+923000000001' } })).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
        checked = true;
        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
    expect(checked).toBe(true);
    expect(await prisma.vendor.count({ where: { slug: 'demo-bakery' } })).toBe(0);
  });
});
