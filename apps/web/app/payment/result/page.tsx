import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { statusLabel, t } from '@/lib/i18n';
import { apiGet, getLocale, isLoggedIn } from '@/lib/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Payment', robots: { index: false } };

interface PaymentView {
  id: string; provider: string; status: string; isSandbox: boolean;
  orderGroup: { orders: { number: string; status: string }[] } | null;
  booking: { number: string; status: string } | null;
}

/** Where JazzCash / Easypaisa send the customer back. The result is read from our API, never from the URL. */
export default async function PaymentResult({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const locale = await getLocale();
  if (!payment) notFound();
  if (!(await isLoggedIn())) redirect(`/login?next=/payment/result?payment=${payment}`);
  const p = await apiGet<PaymentView>(`/payments/${encodeURIComponent(payment)}`, { auth: true });
  if (!p) notFound();
  const ok = p.status === 'SUCCEEDED';
  const failed = p.status === 'FAILED';
  return (
    <section className="wrap" style={{ maxWidth: 560 }}>
      <h1>{t(locale, 'paymentResult')}</h1>
      <p className={failed ? 'error' : 'notice'} role="status" data-testid="payment-result">
        {ok ? t(locale, 'paySucceeded') : failed ? t(locale, 'payFailed') : t(locale, 'payPending')}
      </p>
      {p.isSandbox && <p className="muted">{t(locale, 'sandboxTag')}</p>}
      {p.orderGroup?.orders.map((o) => (
        <p key={o.number}><Link className="btn secondary" href={`/orders/${o.number}`}>{t(locale, 'viewOrder')} {o.number}</Link> <span className="pill status">{statusLabel(locale, o.status)}</span></p>
      ))}
      {p.booking && <p><Link className="btn secondary" href={`/bookings/${p.booking.number}`}>{t(locale, 'viewBooking')} {p.booking.number}</Link> <span className="pill status">{statusLabel(locale, p.booking.status)}</span></p>}
    </section>
  );
}
