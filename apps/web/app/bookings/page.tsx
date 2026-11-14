import Link from 'next/link';
import { redirect } from 'next/navigation';
import { money } from '@/components/ui';
import { statusLabel, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Bookings() {
  const locale = await getLocale();
  const list = await apiGet<{ number: string; status: string; totalPaisa: number; eventStart: string; packageName: string; vendor: { name: string } }[]>('/bookings', { auth: true });
  if (!list) redirect('/login?next=/bookings');
  return (
    <section className="wrap">
      <h1>{t(locale, 'myBookings')}</h1>
      {list.length === 0 ? <p className="muted">{t(locale, 'noResults')}</p> : (
        <table><tbody>{list.map((b) => (
          <tr key={b.number}><td><Link href={`/bookings/${b.number}`}>{b.number}</Link></td><td>{b.vendor.name} · {b.packageName}</td><td>{new Date(b.eventStart).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' })}</td><td><span className="pill status">{statusLabel(locale, b.status)}</span></td><td>{money(locale, b.totalPaisa)}</td></tr>
        ))}</tbody></table>
      )}
    </section>
  );
}
