import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingForm } from '@/components/client';
import { DemoBadge } from '@/components/ui';
import { pick, t } from '@/lib/i18n';
import { apiGet, getLocale, isLoggedIn } from '@/lib/server';

export default async function ServicePage({ params }: { params: Promise<{ vendor: string; slug: string }> }) {
  const { vendor, slug } = await params;
  const locale = await getLocale();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = await apiGet<any>(`/services/${vendor}/${slug}`, { fresh: true });
  if (!s) notFound();
  const tiers: { hoursBefore: number; refundBps: number }[] = s.packages[0]?.cancellationPolicy?.tiers ?? [];
  return (
    <section className="wrap">
      <p className="muted"><Link href="/services">{t(locale, 'services')}</Link> / {pick(locale, s.category.name, s.category.nameUr)}</p>
      <div className="two">
        <div>
          <h1>{pick(locale, s.title, s.titleUr)} <DemoBadge locale={locale} show={s.isDemo} /></h1>
          <p>by <Link href={`/vendors/${s.vendor.slug}`}>{pick(locale, s.vendor.name, s.vendor.nameUr)}</Link></p>
          {s.isDemo && <p className="notice">{t(locale, 'demoNote')}</p>}
          <p>{pick(locale, s.description ?? '', s.descriptionUr)}</p>
          {tiers.length > 0 && (
            <div className="card">
              <h3>{t(locale, 'cancellationPolicy')}</h3>
              <ul>{tiers.map((x) => <li key={x.hoursBefore}>{x.refundBps / 100}% {t(locale, 'refundBefore', { h: x.hoursBefore })}</li>)}</ul>
            </div>
          )}
        </div>
        <BookingForm locale={locale} serviceId={s.id} packages={s.packages} loggedIn={await isLoggedIn()} />
      </div>
    </section>
  );
}
