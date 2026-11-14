import Link from 'next/link';
import { ListingGrid, OccasionGrid, type Listing, type Occasion } from '@/components/ui';
import { t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

export default async function Home() {
  const locale = await getLocale();
  const [occasions, products, services] = await Promise.all([
    apiGet<Occasion[]>('/occasions'),
    apiGet<{ items: Listing[] }>('/products?limit=8'),
    apiGet<{ items: Listing[] }>('/services?limit=8'),
  ]);
  return (
    <>
      <div className="hero">
        <div className="wrap">
          <div className="tag">{t(locale, 'tagline')}</div>
          <h1>{t(locale, 'heroTitle')}</h1>
          <p>{t(locale, 'heroSub')}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <Link className="btn" href="/products">{t(locale, 'products')}</Link>
            <Link className="btn secondary" style={{ color: 'var(--dupatta)', borderColor: 'var(--dupatta)' }} href="/services">{t(locale, 'services')}</Link>
          </div>
        </div>
      </div>
      <section className="wrap">
        <h2>{t(locale, 'browseOccasions')}</h2>
        <OccasionGrid locale={locale} occasions={occasions ?? []} />
      </section>
      <section className="wrap">
        <h2>{t(locale, 'products')}</h2>
        <ListingGrid locale={locale} items={products?.items ?? []} kind="products" />
      </section>
      <section className="wrap">
        <h2>{t(locale, 'services')}</h2>
        <ListingGrid locale={locale} items={services?.items ?? []} kind="services" />
      </section>
    </>
  );
}
