import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApp, useLoad } from '@/lib/app';
import { formatPkt } from '@/lib/dates';
import { statusLabel } from '@/lib/i18n';
import { openWalletPayment, paymentReturnUrl, walletProviders, type Method, type Provider } from '@/lib/pay';
import { Button, Card, Choice, ErrorText, Field, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface Booking {
  number: string; status: string; totalPaisa: number; advancePaisa: number; paidPaisa: number; eventStart: string; packageName: string;
  vendor: { name: string }; events: { id: string; to: string; createdAt: string; note?: string | null }[]; refunds: { id: string; amountPaisa: number; status: string }[];
}

export default function BookingScreen() {
  const { number, new: isNew } = useLocalSearchParams<{ number: string; new?: string }>();
  const { api, t, locale } = useApp();
  const { data: b, error, reload } = useLoad<Booking>(`/bookings/${number}`);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [provider, setProvider] = useState<Provider>('MOCK');
  const { data: methods } = useLoad<Method[]>('/payments/methods');
  if (error) return <Screen><ErrorText msg={error} /></Screen>;
  if (!b) return <Screen><Loading /></Screen>;
  async function act(fn: () => Promise<unknown>) {
    setErr('');
    try { await fn(); await reload(); } catch (e) { setErr((e as Error).message); }
  }
  const pay = (stage: 'advance' | 'remaining') => act(async () => {
    const r = await api.post<{ payment: { id: string }; redirectUrl?: string }>(`/bookings/${b.number}/pay`, { stage, provider, client: 'app', returnTo: paymentReturnUrl(), idempotencyKey: `m-${b.number}-${stage}-${Date.now()}` });
    if (r.redirectUrl) await openWalletPayment(r.redirectUrl, r.payment.id);
  });
  const canPay = b.status === 'ACCEPTED' || (['CONFIRMED', 'COMPLETED'].includes(b.status) && b.paidPaisa < b.totalPaisa);
  return (
    <Screen>
      {isNew && <Txt kind="h1">{t('bookingRequested')}</Txt>}
      <Row style={{ justifyContent: 'space-between' }}><Txt kind="h2">{b.number}</Txt><Pill text={statusLabel(locale, b.status)} /></Row>
      <Txt kind="muted">{b.vendor.name} · {b.packageName} · {formatPkt(b.eventStart, locale)}</Txt>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('total')}</Txt><Money paisa={b.totalPaisa} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('advance')}</Txt><Money paisa={b.advancePaisa} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt>✓</Txt><Money paisa={b.paidPaisa} /></Row>
      </Card>
      {canPay && (
        <Row wrap>
          <Choice label={t('mockPay')} selected={provider === 'MOCK'} onPress={() => setProvider('MOCK')} />
          {walletProviders(methods).map((w) => <Choice key={w} testID={`pay-${w}`} label={`${t(w === 'JAZZCASH' ? 'jazzcash' : 'easypaisa')} (${t('sandboxTag')})`} selected={provider === w} onPress={() => setProvider(w)} />)}
        </Row>
      )}
      {b.status === 'ACCEPTED' && <Button title={t('payAdvance')} onPress={() => pay('advance')} />}
      {['CONFIRMED', 'COMPLETED'].includes(b.status) && b.paidPaisa < b.totalPaisa && <Button title={t('payRemaining')} onPress={() => pay('remaining')} />}
      <Txt kind="h2">{t('status')}</Txt>
      {b.events.map((e) => <Txt key={e.id} kind="muted">• {statusLabel(locale, e.to)} · {formatPkt(e.createdAt, locale)}{e.note ? ` · “${e.note}”` : ''}</Txt>)}
      {b.refunds.map((r) => <Txt key={r.id}>{t('refund')}: <Money paisa={r.amountPaisa} /> · {r.status}</Txt>)}
      {['REQUESTED', 'ACCEPTED', 'CONFIRMED', 'FULLY_PAID', 'RESCHEDULE_REQUESTED'].includes(b.status) && (
        <>
          <Field label={t('reason')} value={reason} onChangeText={setReason} />
          <Button kind="secondary" title={t('cancelBooking')} onPress={() => act(() => api.post(`/bookings/${b.number}/cancel`, { reason: reason || undefined }))} />
        </>
      )}
      <ErrorText msg={err} />
    </Screen>
  );
}
