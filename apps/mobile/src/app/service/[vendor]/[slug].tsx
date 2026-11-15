import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApp, useLoad } from '@/lib/app';
import { pktDate, pktInstant } from '@/lib/dates';
import { pick } from '@/lib/i18n';
import { Button, Card, Choice, ErrorText, Field, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface Service {
  id: string; title: string; titleUr?: string | null; description?: string | null; isDemo: boolean;
  vendor: { name: string; nameUr?: string | null; isVerified: boolean };
  packages: { id: string; name: string; nameUr?: string | null; description?: string | null; pricePaisa: number; advanceBps: number; cancellationPolicy?: { tiers: { hoursBefore: number; refundBps: number }[] } | null }[];
}

export default function ServiceScreen() {
  const { vendor, slug } = useLocalSearchParams<{ vendor: string; slug: string }>();
  const { api, t, locale, loggedIn } = useApp();
  const { data: s, error } = useLoad<Service>(`/services/${vendor}/${slug}`);
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [f, setF] = useState({ date: pktDate(14), time: '19:00', address: '', area: '', guests: '', notes: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (error) return <Screen><ErrorText msg={error} /></Screen>;
  if (!s) return <Screen><Loading /></Screen>;
  const pkg = s.packages.find((p) => p.id === (pkgId ?? s.packages[0]?.id));
  async function request() {
    if (!loggedIn) return router.push('/login');
    setErr(''); setBusy(true);
    try {
      const b = await api.post<{ number: string }>('/bookings', {
        packageId: pkg!.id, eventStart: pktInstant(f.date, f.time), venue: { address: f.address, area: f.area },
        guestCount: f.guests ? Number(f.guests) : undefined, notes: f.notes || undefined,
      });
      router.replace(`/booking/${b.number}?new=1`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Screen>
      <Stack.Screen options={{ title: pick(locale, s.title, s.titleUr) }} />
      <Row wrap>{s.isDemo && <Pill text={t('demo')} tone="demo" />}{s.vendor.isVerified && <Pill text={t('verified')} tone="ok" />}</Row>
      <Txt kind="h1">{pick(locale, s.title, s.titleUr)}</Txt>
      <Txt kind="muted">{pick(locale, s.vendor.name, s.vendor.nameUr)}</Txt>
      {s.description && <Txt>{s.description}</Txt>}
      <Txt kind="h2">{t('packages')}</Txt>
      <Row wrap>{s.packages.map((p) => <Choice key={p.id} testID={`package-${p.name}`} label={pick(locale, p.name, p.nameUr)} selected={p.id === pkg?.id} onPress={() => setPkgId(p.id)} />)}</Row>
      {pkg && (
        <Card>
          <Money paisa={pkg.pricePaisa} style={{ fontSize: 20 }} />
          <Row><Txt kind="muted">{t('advance')} {pkg.advanceBps / 100}%:</Txt><Money paisa={Math.round((pkg.pricePaisa * pkg.advanceBps) / 10_000)} /></Row>
          {pkg.cancellationPolicy && (
            <>
              <Txt style={{ fontWeight: '600' }}>{t('refundPolicy')}</Txt>
              {pkg.cancellationPolicy.tiers.map((tier) => <Txt key={tier.hoursBefore} kind="muted">≥ {tier.hoursBefore} {t('hoursBefore')} → {tier.refundBps / 100}%</Txt>)}
            </>
          )}
        </Card>
      )}
      <Field label={t('eventDate')} placeholder="YYYY-MM-DD" value={f.date} onChangeText={set('date')} />
      <Field label={t('eventTime')} placeholder="19:00" value={f.time} onChangeText={set('time')} />
      <Field label={t('venueAddress')} value={f.address} onChangeText={set('address')} />
      <Field label={t('area')} value={f.area} onChangeText={set('area')} />
      <Field label={t('guests')} keyboardType="number-pad" value={f.guests} onChangeText={set('guests')} />
      <Field label={t('notes')} multiline value={f.notes} onChangeText={set('notes')} />
      <Button title={t('requestBooking')} onPress={request} disabled={busy || !pkg || f.address.length < 3 || f.area.length < 2} />
      <ErrorText msg={err} />
    </Screen>
  );
}
