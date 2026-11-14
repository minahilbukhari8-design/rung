/**
 * Seeds reference data (occasions, categories, Lahore zones) and clearly-labelled DEMO vendors.
 * DEMO vendors, products, services and prices are NOT real: every row has isDemo = true and
 * names start with "DEMO". Prices are round placeholders only, for testing flows.
 * Run: pnpm --filter @rung/api seed   (add --no-demo to seed reference data only)
 */
import { PrismaClient } from '@prisma/client';

export const OCCASIONS = [
  ['birthday', 'Birthday', 'سالگرہ', 'rani'],
  ['anniversary', 'Anniversary', 'شادی کی سالگرہ', 'kesar'],
  ['mehndi', 'Mehndi', 'مہندی', 'mehndi'],
  ['dholki', 'Dholki', 'ڈھولکی', 'mehndi'],
  ['nikah', 'Nikah', 'نکاح', 'zari'],
  ['baraat', 'Baraat', 'بارات', 'zari'],
  ['walima', 'Walima', 'ولیمہ', 'zari'],
  ['eid', 'Eid', 'عید', 'genda'],
  ['aqeeqa', 'Aqeeqa', 'عقیقہ', 'firozi'],
  ['baby-shower', 'Baby shower', 'گود بھرائی', 'firozi'],
  ['graduation', 'Graduation', 'گریجویشن', 'firozi'],
  ['corporate', 'Corporate', 'کارپوریٹ', 'shab'],
  ['get-well', 'Get well soon', 'جلد صحت یابی', 'shab'],
  ['condolence', 'Condolence', 'تعزیت', 'shab'],
] as const;

export const CATEGORIES = [
  ['PRODUCT', 'cakes', 'Cakes', 'کیک'],
  ['PRODUCT', 'flowers', 'Flowers', 'پھول'],
  ['PRODUCT', 'gifts', 'Gifts & hampers', 'تحفے'],
  ['PRODUCT', 'fashion', 'Fashion', 'فیشن'],
  ['SERVICE', 'decor', 'Decor', 'سجاوٹ'],
  ['SERVICE', 'catering', 'Catering', 'کیٹرنگ'],
  ['SERVICE', 'beauty', 'Makeup & mehndi', 'میک اپ اور مہندی'],
  ['SERVICE', 'photo-video', 'Photo & video', 'فوٹو اور ویڈیو'],
  ['SERVICE', 'venues', 'Venues', 'ہال اور مارکی'],
  ['SERVICE', 'entertainment', 'Entertainment', 'تفریح'],
] as const;

/** Lahore areas grouped into delivery zones (geography only; charges are set by each vendor). */
export const ZONES: [string, string, string[]][] = [
  ['DHA', 'ڈی ایچ اے', ['DHA', 'DHA Phase 1', 'DHA Phase 5', 'DHA Phase 6', 'Cantt']],
  ['Gulberg', 'گلبرگ', ['Gulberg', 'Gulberg II', 'Gulberg III', 'MM Alam Road']],
  ['Model Town', 'ماڈل ٹاؤن', ['Model Town', 'Faisal Town', 'Garden Town']],
  ['Johar Town', 'جوہر ٹاؤن', ['Johar Town', 'Wapda Town', 'Valencia']],
  ['Bahria Town', 'بحریہ ٹاؤن', ['Bahria Town', 'Bahria Orchard']],
];

export async function seedReference(prisma: PrismaClient) {
  for (const [i, [slug, name, nameUr, accentToken]] of OCCASIONS.entries()) {
    await prisma.occasion.upsert({ where: { slug }, update: {}, create: { slug, name, nameUr, accentToken, sortOrder: i, isSombre: slug === 'condolence' || slug === 'get-well' } });
  }
  for (const [i, [kind, slug, name, nameUr]] of CATEGORIES.entries()) {
    await prisma.category.upsert({ where: { slug }, update: {}, create: { kind, slug, name, nameUr, sortOrder: i } });
  }
  for (const [name, nameUr, areas] of ZONES) {
    await prisma.deliveryZone.upsert({ where: { city_name: { city: 'Lahore', name } }, update: { areas }, create: { name, nameUr, areas } });
  }
}

export async function seedDemo(prisma: PrismaClient) {
  const cat = async (slug: string) => (await prisma.category.findUniqueOrThrow({ where: { slug } })).id;
  const occ = async (slug: string) => ({ id: (await prisma.occasion.findUniqueOrThrow({ where: { slug } })).id });
  const zones = await prisma.deliveryZone.findMany();

  const owner = await prisma.user.upsert({ where: { phone: '+923000000101' }, update: {}, create: { phone: '+923000000101', name: 'DEMO Vendor Owner', roles: ['CUSTOMER', 'VENDOR'], isDemo: true } });
  const bakery = await prisma.vendor.upsert({
    where: { slug: 'demo-bakery' },
    update: {},
    create: {
      slug: 'demo-bakery', name: 'DEMO Bakery', nameUr: 'ڈیمو بیکری', kind: 'PRODUCTS', status: 'APPROVED', phone: owner.phone, isDemo: true,
      tagline: 'Demo listing for testing. Not a real shop.', commissionBps: 1200, approvedAt: new Date(),
      members: { create: { userId: owner.id, role: 'OWNER' } },
      deliveryZones: { create: zones.map((z) => ({ zoneId: z.id, chargePaisa: 0, sameDayCutoffMinute: 14 * 60 })) },
      deliverySlots: { create: [0, 1, 2, 3, 4, 5, 6].flatMap((d) => [12, 15, 18].map((h) => ({ dayOfWeek: d, startMinute: h * 60, endMinute: (h + 3) * 60, capacity: 5 }))) },
    },
  });
  await prisma.product.upsert({
    where: { vendorId_slug: { vendorId: bakery.id, slug: 'demo-chocolate-cake' } },
    update: {},
    create: {
      vendorId: bakery.id, slug: 'demo-chocolate-cake', title: 'DEMO Chocolate Cake', titleUr: 'ڈیمو چاکلیٹ کیک', categoryId: await cat('cakes'),
      description: 'Demo product for testing. Price is a placeholder.', status: 'ACTIVE', leadTimeMinutes: 240, isCustomizable: true, isDemo: true,
      occasions: { connect: [await occ('birthday'), await occ('anniversary')] },
      variants: { create: [{ name: '1 lb', pricePaisa: 100_000, stock: 20, sortOrder: 0 }, { name: '2 lb', pricePaisa: 200_000, stock: 20, sortOrder: 1 }] },
      customizations: { create: [{ label: 'Message on cake', labelUr: 'کیک پر پیغام', type: 'TEXT', maxLength: 30 }] },
    },
  });

  const decorOwner = await prisma.user.upsert({ where: { phone: '+923000000102' }, update: {}, create: { phone: '+923000000102', name: 'DEMO Decor Owner', roles: ['CUSTOMER', 'VENDOR'], isDemo: true } });
  const decor = await prisma.vendor.upsert({
    where: { slug: 'demo-decor' },
    update: {},
    create: {
      slug: 'demo-decor', name: 'DEMO Decor Studio', nameUr: 'ڈیمو ڈیکور', kind: 'SERVICES', status: 'APPROVED', phone: decorOwner.phone, isDemo: true,
      tagline: 'Demo listing for testing. Not a real business.', commissionBps: 1000, approvedAt: new Date(),
      members: { create: { userId: decorOwner.id, role: 'OWNER' } },
    },
  });
  const existing = await prisma.service.findUnique({ where: { vendorId_slug: { vendorId: decor.id, slug: 'demo-mehndi-decor' } } });
  if (!existing) {
    const policy = await prisma.cancellationPolicy.create({ data: { vendorId: decor.id, name: 'DEMO standard', tiers: [{ hoursBefore: 168, refundBps: 10000 }, { hoursBefore: 48, refundBps: 5000 }, { hoursBefore: 0, refundBps: 0 }] } });
    await prisma.service.create({
      data: {
        vendorId: decor.id, slug: 'demo-mehndi-decor', title: 'DEMO Mehndi Stage Decor', titleUr: 'ڈیمو مہندی سجاوٹ', categoryId: await cat('decor'),
        description: 'Demo service for testing. Price is a placeholder.', status: 'ACTIVE', maxBookingsPerDay: 1, serviceAreas: ['DHA', 'Gulberg', 'Johar Town'], isDemo: true,
        occasions: { connect: [await occ('mehndi'), await occ('dholki')] },
        packages: { create: [{ name: 'DEMO Basic', inclusions: ['Stage backdrop', 'Floor seating'], pricePaisa: 1_000_000, advanceBps: 3000, maxGuests: 150, cancellationPolicyId: policy.id }] },
      },
    });
  }
  return { bakery, decor };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prisma = new PrismaClient();
  await seedReference(prisma);
  if (!process.argv.includes('--no-demo')) await seedDemo(prisma);
  if (process.env.ADMIN_PHONE) {
    await prisma.user.upsert({ where: { phone: process.env.ADMIN_PHONE }, update: { roles: { set: ['CUSTOMER', 'ADMIN'] } }, create: { phone: process.env.ADMIN_PHONE, roles: ['CUSTOMER', 'ADMIN'], adminPermissions: ['SUPERADMIN'] } });
  }
  console.log('Seed complete. DEMO rows are flagged isDemo=true.');
  await prisma.$disconnect();
}
