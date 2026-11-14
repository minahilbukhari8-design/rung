import { notFound } from 'next/navigation';
import { ACCENT, ListingGrid, type Listing, type Occasion } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

export default async function OccasionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const occasions = (await apiGet<Occasion[]>('/occasions')) ?? [];
  const o = occasions.find((x) => x.slug === slug);
  if (!o) notFound();
  const [products, services] = await Promise.all([
    apiGet<{ items: Listing[] }>(`/products?occasion=${slug}`),
    apiGet<{ items: Listing[] }>(`/services?occasion=${slug}`),
  ]);
  return (
    <>
      <div className="hero" style={{ background: o.isSombre ? '#4a3a50' : ACCENT[o.accentToken], color: ['genda', 'zari'].includes(o.accentToken) ? 'var(--shab)' : undefined }}>
        <div className="wrap"><h1>{pick(locale, o.name, o.nameUr)}</h1></div>
      </div>
      <section className="wrap"><h2>{t(locale, 'products')}</h2><ListingGrid locale={locale} items={products?.items ?? []} kind="products" /></section>
      <section className="wrap"><h2>{t(locale, 'services')}</h2><ListingGrid locale={locale} items={services?.items ?? []} kind="services" /></section>
    </>
  );
}
