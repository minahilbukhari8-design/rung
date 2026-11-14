import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AddToCart } from '@/components/client';
import { DemoBadge } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale, isLoggedIn } from '@/lib/server';

export default async function ProductPage({ params }: { params: Promise<{ vendor: string; slug: string }> }) {
  const { vendor, slug } = await params;
  const locale = await getLocale();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = await apiGet<any>(`/products/${vendor}/${slug}`, { fresh: true });
  if (!p) notFound();
  return (
    <section className="wrap">
      <p className="muted"><Link href="/products">{t(locale, 'products')}</Link> / {pick(locale, p.category.name, p.category.nameUr)}</p>
      <div className="two">
        <div>
          <div className="card"><div className="thumb" style={{ aspectRatio: '1' }}><img src="/brand/rung-mark.svg" alt="" /></div></div>
          {p.isDemo && <p className="notice" style={{ marginTop: 12 }}>{t(locale, 'demoNote')}</p>}
        </div>
        <div>
          <h1>{pick(locale, p.title, p.titleUr)} <DemoBadge locale={locale} show={p.isDemo} /></h1>
          <p>by <Link href={`/vendors/${p.vendor.slug}`}>{pick(locale, p.vendor.name, p.vendor.nameUr)}</Link> {p.vendor.isVerified && <span className="pill ok">{t(locale, 'verified')}</span>}</p>
          <p>{pick(locale, p.description ?? '', p.descriptionUr)}</p>
          <AddToCart locale={locale} variants={p.variants} customizations={p.customizations} loggedIn={await isLoggedIn()} />
        </div>
      </div>
    </section>
  );
}
