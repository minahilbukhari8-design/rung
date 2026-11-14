import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DemoBadge, money } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

interface V {
  slug: string; name: string; nameUr?: string; tagline?: string; description?: string; descriptionUr?: string; isVerified: boolean; isDemo: boolean; ratingAvg: number; ratingCount: number;
  products: { id: string; slug: string; title: string; titleUr?: string }[]; services: { id: string; slug: string; title: string; titleUr?: string }[];
  deliveryZones: { chargePaisa: number; zone: { id: string; name: string; nameUr?: string } }[];
}

export default async function VendorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const locale = await getLocale();
  const v = await apiGet<V>(`/vendors/${slug}`);
  if (!v) notFound();
  return (
    <section className="wrap">
      <h1>{pick(locale, v.name, v.nameUr)} <DemoBadge locale={locale} show={v.isDemo} /></h1>
      {v.isDemo && <p className="notice">{t(locale, 'demoNote')}</p>}
      <p>{pick(locale, v.description ?? v.tagline ?? '', v.descriptionUr)}</p>
      {v.ratingCount > 0 && <p>★ {v.ratingAvg.toFixed(1)} ({v.ratingCount})</p>}
      <div className="two">
        <div>
          {v.products.length > 0 && <><h2>{t(locale, 'products')}</h2><ul>{v.products.map((p) => <li key={p.id}><Link href={`/products/${v.slug}/${p.slug}`}>{pick(locale, p.title, p.titleUr)}</Link></li>)}</ul></>}
          {v.services.length > 0 && <><h2>{t(locale, 'services')}</h2><ul>{v.services.map((s) => <li key={s.id}><Link href={`/services/${v.slug}/${s.slug}`}>{pick(locale, s.title, s.titleUr)}</Link></li>)}</ul></>}
        </div>
        {v.deliveryZones.length > 0 && (
          <div className="card">
            <h3>{t(locale, 'delivery')}</h3>
            <table><tbody>{v.deliveryZones.map((z) => <tr key={z.zone.id}><td>{pick(locale, z.zone.name, z.zone.nameUr)}</td><td>{money(locale, z.chargePaisa)}</td></tr>)}</tbody></table>
          </div>
        )}
      </div>
    </section>
  );
}
