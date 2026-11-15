import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useApp, useLoad } from '@/lib/app';
import { statusLabel } from '@/lib/i18n';
import { Button, Card, ErrorText, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface PaymentView {
  id: string; provider: string; status: 'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REFUNDED'; amountPaisa: number; isSandbox: boolean;
  orderGroup: { orders: { number: string; status: string }[] } | null; booking: { number: string; status: string } | null;
}

export default function PaymentResult() {
  const { payment } = useLocalSearchParams<{ payment: string }>();
  const { t, locale } = useApp();
  const { data: p, error, reload } = useLoad<PaymentView>(payment ? `/payments/${payment}` : null);
  const waiting = p && (p.status === 'PENDING' || p.status === 'INITIATED');
  // the wallet may confirm a few seconds after the customer is back: look again for a short while
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => void reload(), 4000);
    const stop = setTimeout(() => clearInterval(id), 60_000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [waiting, reload]);

  if (error) return <Screen><ErrorText msg={error} /></Screen>;
  if (!p) return <Screen><Loading /></Screen>;
  const msg = p.status === 'SUCCEEDED' ? t('paySucceeded') : p.status === 'FAILED' ? t('payFailed') : t('payPending');
  const order = p.orderGroup?.orders[0];
  return (
    <Screen>
      <Txt kind="h1">{t('paymentResult')}</Txt>
      <Card testID="payment-result">
        <Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontWeight: '700' }}>{msg}</Txt></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt kind="muted">{p.provider}</Txt><Money paisa={p.amountPaisa} /></Row>
        {p.isSandbox && <Pill text={t('sandboxTag')} />}
        {order && <Txt kind="muted">{order.number} · {statusLabel(locale, order.status)}</Txt>}
        {p.booking && <Txt kind="muted">{p.booking.number} · {statusLabel(locale, p.booking.status)}</Txt>}
      </Card>
      {waiting && <Button kind="secondary" title={t('checkAgain')} onPress={() => void reload()} />}
      {order && <Button title={t('viewOrder')} onPress={() => router.replace(`/order/${order.number}`)} />}
      {p.booking && <Button title={t('viewBooking')} onPress={() => router.replace(`/booking/${p.booking!.number}`)} />}
    </Screen>
  );
}
