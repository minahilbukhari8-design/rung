import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useApp } from '@/lib/app';
import { formatPkt } from '@/lib/dates';
import { statusLabel } from '@/lib/i18n';
import { Button, Card, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface OrderRow { number: string; status: string; totalPaisa: number; deliveryDate: string; vendor: { name: string } }
interface BookingRow { number: string; status: string; totalPaisa: number; eventStart: string; packageName: string; vendor?: { name: string } }

export default function Account() {
  const { api, t, locale, loggedIn, setLoggedIn } = useApp();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [bookings, setBookings] = useState<BookingRow[] | null>(null);
  const [me, setMe] = useState<{ phone: string } | null>(null);
  useFocusEffect(useCallback(() => {
    if (!loggedIn) return;
    void api.get<OrderRow[]>('/orders').then(setOrders).catch(() => undefined);
    void api.get<BookingRow[]>('/bookings').then(setBookings).catch(() => undefined);
    void api.get<{ phone: string }>('/me').then(setMe).catch(() => undefined);
  }, [api, loggedIn]));
  if (!loggedIn) return <Screen><Txt>{t('loginToContinue')}</Txt><Button title={t('login')} onPress={() => router.push('/login')} /></Screen>;
  return (
    <Screen>
      {me && <Txt kind="muted">{me.phone}</Txt>}
      <Txt kind="h2">{t('myOrders')}</Txt>
      {orders?.length === 0 && <Txt kind="muted">{t('none')}</Txt>}
      {orders?.map((o) => (
        <Card key={o.number} testID={`order-${o.number}`} label={o.number} onPress={() => router.push(`/order/${o.number}`)}>
          <Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontWeight: '700' }}>{o.number}</Txt><Pill text={statusLabel(locale, o.status)} /></Row>
          <Row style={{ justifyContent: 'space-between' }}><Txt kind="muted">{o.vendor.name} · {o.deliveryDate.slice(0, 10)}</Txt><Money paisa={o.totalPaisa} /></Row>
        </Card>
      ))}
      <Txt kind="h2">{t('myBookings')}</Txt>
      {bookings?.length === 0 && <Txt kind="muted">{t('none')}</Txt>}
      {bookings?.map((b) => (
        <Card key={b.number} testID={`booking-${b.number}`} label={b.number} onPress={() => router.push(`/booking/${b.number}`)}>
          <Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontWeight: '700' }}>{b.number}</Txt><Pill text={statusLabel(locale, b.status)} /></Row>
          <Row style={{ justifyContent: 'space-between' }}><Txt kind="muted">{b.packageName} · {formatPkt(b.eventStart, locale)}</Txt><Money paisa={b.totalPaisa} /></Row>
        </Card>
      ))}
      <Button kind="secondary" title={t('logout')} onPress={async () => { await api.logout(); setLoggedIn(false); setOrders(null); setBookings(null); }} />
    </Screen>
  );
}
