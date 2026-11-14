import Link from 'next/link';
import { DemoBadge } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

interface Hit { id: string; slug: string; title: string; titleUr?: string; isDemo: boolean; vendor: { slug: string; name: string } }
interface Result { products: Hit[]; services: Hit[]; vendors: { slug: string; name: string; nameUr?: string; isDemo: boolean }[] }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const locale = await getLocale();
  const r = q.trim() ? await apiGet<Result>(`/search?q=${encodeURIComponent(q.trim())}`) : null;
  const block = (title: string, hits: Hit[], kind: string) => (
    <div>
      <h2>{title}</h2>
      {hits.length ? <ul>{hits.map((h) => <li key={h.id}><Link href={`/${kind}/${h.vendor.slug}/${h.slug}`}>{pick(locale, h.title, h.titleUr)}</Link> <span className="muted">· {h.vendor.name}</span> <DemoBadge locale={locale} show={h.isDemo} /></li>)}</ul> : <p className="muted">{t(locale, 'noResults')}</p>}
    </div>
  );
  return (
    <section className="wrap">
      <h1>{t(locale, 'search')}: “{q}”</h1>
      {r && (
        <>
          {block(t(locale, 'products'), r.products, 'products')}
          {block(t(locale, 'services'), r.services, 'services')}
          <h2>{t(locale, 'vendors')}</h2>
          {r.vendors.length ? <ul>{r.vendors.map((v) => <li key={v.slug}><Link href={`/vendors/${v.slug}`}>{pick(locale, v.name, v.nameUr)}</Link> <DemoBadge locale={locale} show={v.isDemo} /></li>)}</ul> : <p className="muted">{t(locale, 'noResults')}</p>}
        </>
      )}
    </section>
  );
}
