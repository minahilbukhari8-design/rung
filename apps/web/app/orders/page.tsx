import Link from 'next/link';
import { redirect } from 'next/navigation';
import { money } from '@/components/ui';
import { statusLabel, t } from '@/lib/i18n';
import { apiGet, getLocale } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Orders() {
  const locale = await getLocale();
  const orders = await apiGet<{ number: string; status: string; totalPaisa: number; deliveryDate: string; vendor: { name: string } }[]>('/orders', { auth: true });
  if (!orders) redirect('/login?next=/orders');
  return (
    <section className="wrap">
      <h1>{t(locale, 'myOrders')}</h1>
      {orders.length === 0 ? <p className="muted">{t(locale, 'noResults')}</p> : (
        <table><tbody>{orders.map((o) => (
          <tr key={o.number}><td><Link href={`/orders/${o.number}`}>{o.number}</Link></td><td>{o.vendor.name}</td><td>{o.deliveryDate.slice(0, 10)}</td><td><span className="pill status">{statusLabel(locale, o.status)}</span></td><td>{money(locale, o.totalPaisa)}</td></tr>
        ))}</tbody></table>
      )}
    </section>
  );
}
