import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApp, useLoad } from '@/lib/app';
import { formatPkt, hhmm } from '@/lib/dates';
import { statusLabel } from '@/lib/i18n';
import { Button, Card, ErrorText, Field, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface Order {
  number: string; status: string; totalPaisa: number; deliveryChargePaisa: number; deliveryDate: string; slotStartMinute: number; slotEndMinute: number; recipientName: string;
  vendor: { name: string }; items: { id: string; productTitle: string; variantName: string; quantity: number; lineTotalPaisa?: number }[];
  events: { id: string; to: string; createdAt: string; note?: string | null }[]; refunds: { id: string; amountPaisa: number; status: string }[];
}

export default function OrderScreen() {
  const { number, new: isNew } = useLocalSearchParams<{ number: string; new?: string }>();
  const { api, t, locale } = useApp();
  const { data: o, error, reload } = useLoad<Order>(`/orders/${number}`);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  if (error) return <Screen><ErrorText msg={error} /></Screen>;
  if (!o) return <Screen><Loading /></Screen>;
  const cancellable = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED'].includes(o.status);
  return (
    <Screen>
      {isNew && <Txt kind="h1">{t('orderPlaced')}</Txt>}
      <Row style={{ justifyContent: 'space-between' }}><Txt kind="h2">{o.number}</Txt><Pill text={statusLabel(locale, o.status)} /></Row>
      <Txt kind="muted">{o.vendor.name} · {o.deliveryDate.slice(0, 10)} · {hhmm(o.slotStartMinute)}–{hhmm(o.slotEndMinute)} · {o.recipientName}</Txt>
      <Card>
        {o.items.map((i) => <Txt key={i.id}>{i.productTitle} · {i.variantName} × {i.quantity}</Txt>)}
        <Row style={{ justifyContent: 'space-between' }}><Txt>{t('delivery')}</Txt><Money paisa={o.deliveryChargePaisa} /></Row>
        <Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontWeight: '700' }}>{t('total')}</Txt><Money paisa={o.totalPaisa} /></Row>
      </Card>
      <Txt kind="h2">{t('status')}</Txt>
      {o.events.map((e) => <Txt key={e.id} kind="muted">• {statusLabel(locale, e.to)} · {formatPkt(e.createdAt, locale)}{e.note ? ` · “${e.note}”` : ''}</Txt>)}
      {o.refunds.map((r) => <Txt key={r.id} testID="refund">{t('refund')}: <Money paisa={r.amountPaisa} /> · {r.status}</Txt>)}
      {cancellable && (
        <>
          <Field label={t('reason')} value={reason} onChangeText={setReason} />
          <Button kind="secondary" title={t('cancelOrder')} onPress={async () => {
            setErr('');
            try { await api.post(`/orders/${o.number}/cancel`, { reason: reason || undefined }); await reload(); } catch (e) { setErr((e as Error).message); }
          }} />
        </>
      )}
      <ErrorText msg={err} />
    </Screen>
  );
}
