import { notFound, redirect } from 'next/navigation';
import { CancelOrder } from '@/components/client';
import { money } from '@/components/ui';
import { statusLabel, t } from '@/lib/i18n';
import { apiGet, getLocale, isLoggedIn } from '@/lib/server';

export const dynamic = 'force-dynamic';
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function OrderPage({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { number } = await params;
  const { placed } = await searchParams;
  const locale = await getLocale();
  if (!(await isLoggedIn())) redirect(`/login?next=/orders/${number}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = await apiGet<any>(`/orders/${number}`, { auth: true });
  if (!o) notFound();
  return (
    <section className="wrap">
      {placed && <p className="notice" role="status">{t(locale, 'orderPlaced')} ✓</p>}
      <h1>{o.number}</h1>
      <p><span className="pill status" data-testid="order-status">{statusLabel(locale, o.status)}</span> · {o.vendor.name}</p>
      <div className="two">
        <div className="card">
          <table><tbody>
            {o.items.map((i: { id: string; productTitle: string; variantName: string; quantity: number; lineTotalPaisa: number }) => <tr key={i.id}><td>{i.productTitle} · {i.variantName} × {i.quantity}</td><td>{money(locale, i.lineTotalPaisa)}</td></tr>)}
            <tr><td>{t(locale, 'delivery')}</td><td>{money(locale, o.deliveryChargePaisa)}</td></tr>
            <tr><th>{t(locale, 'total')}</th><th>{money(locale, o.totalPaisa)}</th></tr>
          </tbody></table>
          <p>{t(locale, 'deliverTo')}: {o.recipientName}, {o.addressSnapshot.line1}, {o.addressSnapshot.area} · {o.deliveryDate.slice(0, 10)} {hhmm(o.slotStartMinute)}–{hhmm(o.slotEndMinute)}</p>
          {o.giftMessage && <p>“{o.giftMessage}”</p>}
          {['PENDING_PAYMENT', 'PLACED', 'ACCEPTED'].includes(o.status) && <CancelOrder locale={locale} number={o.number} />}
        </div>
        <div>
          <h3>{t(locale, 'status')}</h3>
          <ol className="timeline">
            {o.events.map((e: { id: string; to: string; createdAt: string; note?: string }) => <li key={e.id}><strong>{statusLabel(locale, e.to)}</strong> <span className="muted">{new Date(e.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</span>{e.note ? <div className="muted">{e.note}</div> : null}</li>)}
          </ol>
          {o.refunds.length > 0 && <p className="notice">Refund: {money(locale, o.refunds[0].amountPaisa)} ({o.refunds[0].status})</p>}
        </div>
      </div>
    </section>
  );
}
