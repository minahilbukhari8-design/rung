import Link from 'next/link';
import { ListingGrid, type Listing } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

interface Category { id: string; slug: string; name: string; nameUr: string }

export default async function ListPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const locale = await getLocale();
  const kindUpper = 'PRODUCT';
  const [cats, list] = await Promise.all([
    apiGet<Category[]>(`/categories?kind=${kindUpper}`),
    apiGet<{ items: Listing[] }>(`/products?limit=48${category ? `&category=${encodeURIComponent(category)}` : ''}`),
  ]);
  return (
    <section className="wrap">
      <h1>{t(locale, 'products')}</h1>
      <nav aria-label="Categories" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <Link className={`btn small ${category ? 'secondary' : ''}`} href="/products">All</Link>
        {(cats ?? []).map((c) => (
          <Link key={c.id} className={`btn small ${category === c.slug ? '' : 'secondary'}`} href={`/products?category=${c.slug}`}>{pick(locale, c.name, c.nameUr)}</Link>
        ))}
      </nav>
      <ListingGrid locale={locale} items={list?.items ?? []} kind="products" />
    </section>
  );
}
