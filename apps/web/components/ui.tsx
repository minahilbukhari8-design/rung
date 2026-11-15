import { formatPKR } from '@rung/domain';
import Link from 'next/link';
import { pick, t, type Locale } from '@/lib/i18n';

export const ACCENT: Record<string, string> = {
  rani: 'var(--rani)', genda: 'var(--genda)', firozi: 'var(--firozi-deep)', kesar: 'var(--kesar-deep)', mehndi: 'var(--mehndi-deep)', zari: 'var(--zari)', shab: 'var(--shab)',
};

export interface Occasion { id: string; slug: string; name: string; nameUr: string; accentToken: string; isSombre: boolean }
export interface ListingVendor { slug: string; name: string; nameUr?: string | null; isVerified: boolean; isDemo: boolean }
export interface Listing { id: string; slug: string; title: string; titleUr?: string | null; isDemo: boolean; fromPricePaisa: number | null; vendor: ListingVendor }

export const money = (locale: Locale, paisa: number) => formatPKR(paisa, locale);

export function OccasionGrid({ locale, occasions }: { locale: Locale; occasions: Occasion[] }) {
  return (
    <div className="occasions">
      {occasions.map((o) => (
        <Link key={o.id} href={`/occasions/${o.slug}`} className={`occ ${['genda', 'zari'].includes(o.accentToken) ? 'dark-text' : ''}`} style={{ background: o.isSombre ? '#5a4a60' : ACCENT[o.accentToken] }}>
          <span>{o.name}</span>
          <small lang="ur" dir="rtl">{o.nameUr}</small>
        </Link>
      ))}
    </div>
  );
}

export function DemoBadge({ locale, show }: { locale: Locale; show: boolean }) {
  return show ? <span className="pill demo" title={t(locale, 'demoNote')}>{t(locale, 'demo')}</span> : null;
}

export function ListingCard({ locale, item, kind }: { locale: Locale; item: Listing; kind: 'products' | 'services' }) {
  return (
    <Link className="card" href={`/${kind}/${item.vendor.slug}/${item.slug}`}>
      <div className="thumb"><img src="/brand/rung-mark.svg" alt="" /></div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>{pick(locale, item.title, item.titleUr)}</strong> <DemoBadge locale={locale} show={item.isDemo || item.vendor.isDemo} />
      </div>
      <div className="muted">{pick(locale, item.vendor.name, item.vendor.nameUr)} {item.vendor.isVerified ? <span className="pill ok">{t(locale, 'verified')}</span> : null}</div>
      {item.fromPricePaisa != null && <div className="price">{t(locale, 'from')} {money(locale, item.fromPricePaisa)}</div>}
    </Link>
  );
}

export function ListingGrid({ locale, items, kind }: { locale: Locale; items: Listing[]; kind: 'products' | 'services' }) {
  if (!items.length) return <p className="muted">{t(locale, 'noResults')}</p>;
  return <div className="grid">{items.map((i) => <ListingCard key={i.id} locale={locale} item={i} kind={kind} />)}</div>;
}
