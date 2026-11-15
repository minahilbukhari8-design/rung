import { notFound, redirect } from 'next/navigation';
import { BookingActions } from '@/components/client';
import { money } from '@/components/ui';
import { statusLabel, t } from '@/lib/i18n';
import { apiGet, getLocale, isLoggedIn } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function BookingPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const locale = await getLocale();
  if (!(await isLoggedIn())) redirect(`/login?next=/bookings/${number}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b = await apiGet<any>(`/bookings/${number}`, { auth: true });
  if (!b) notFound();
  const due = b.totalPaisa - b.paidPaisa;
  return (
    <section className="wrap">
      <h1>{b.number}</h1>
      <p><span className="pill status" data-testid="booking-status">{statusLabel(locale, b.status)}</span> · {b.vendor.name} · {b.packageName}</p>
      <div className="two">
        <div className="card">
          <p>{t(locale, 'eventDate')}: {new Date(b.eventStart).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'full', timeStyle: 'short' })}</p>
          <p>{t(locale, 'venue')}: {b.venueSnapshot.address}, {b.venueSnapshot.area}</p>
          <table><tbody>
            <tr><td>{t(locale, 'total')}</td><td>{money(locale, b.totalPaisa)}</td></tr>
            <tr><td>{t(locale, 'advance')}</td><td>{money(locale, b.advancePaisa)}</td></tr>
            <tr><td>Paid</td><td data-testid="paid">{money(locale, b.paidPaisa)}</td></tr>
            <tr><th>Due</th><th>{money(locale, due)}</th></tr>
          </tbody></table>
          <BookingActions locale={locale} number={b.number} status={b.status} canPayRemaining={['CONFIRMED', 'COMPLETED'].includes(b.status) && due > 0} />
        </div>
        <div>
          <h2 style={{ fontSize: 20 }}>{t(locale, 'status')}</h2>
          <ol className="timeline">
            {b.events.map((e: { id: string; to: string; createdAt: string; note?: string }) => <li key={e.id}><strong>{statusLabel(locale, e.to)}</strong> <span className="muted">{new Date(e.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</span>{e.note && !e.note.startsWith('from:') ? <div className="muted">{e.note}</div> : null}</li>)}
          </ol>
          {b.refunds.length > 0 && <p className="notice">Refund: {money(locale, b.refunds.reduce((a: number, r: { amountPaisa: number }) => a + r.amountPaisa, 0))}</p>}
        </div>
      </div>
    </section>
  );
}
