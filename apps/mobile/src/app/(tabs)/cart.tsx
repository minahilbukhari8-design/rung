import { useFocusEffect, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/lib/app';
import { hhmm, pktDate } from '@/lib/dates';
import { pick } from '@/lib/i18n';
import { openWalletPayment, paymentReturnUrl, walletProviders, type Method, type Provider } from '@/lib/pay';
import { Button, Card, Choice, ErrorText, Field, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface CartItem { id: string; quantity: number; customization: Record<string, string>; variant: { id: string; name: string; pricePaisa: number; product: { id: string; title: string; titleUr?: string | null; vendorId: string; vendor: { name: string; nameUr?: string | null; isDemo: boolean } } } }
interface Address { id: string; recipientName: string; line1: string; area: string; zoneId: string | null }
interface Slot { startMinute: number; endMinute: number; remaining: number }
interface Group { vendorId: string; vendorName: string; productId: string; items: CartItem[] }

function VendorGroup({ g, address, value, onChange }: { g: Group; address: Address | null; value: { date: string; slot: number | null }; onChange: (v: { date: string; slot: number | null }) => void }) {
  const { api, t, locale } = useApp();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  useEffect(() => {
    setSlots(null);
    if (!address?.zoneId) return;
    void api.get<{ slots: Slot[] }>(`/products/${g.productId}/delivery-slots?zone=${address.zoneId}&date=${value.date}`).then((r) => setSlots(r.slots)).catch(() => setSlots([]));
  }, [api, g.productId, address?.zoneId, value.date]);
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => pktDate(d));
  return (
    <Card testID={`group-${g.vendorId}`}>
      <Txt style={{ fontWeight: '700' }}>{g.vendorName}</Txt>
      {g.items.map((i) => (
        <Row key={i.id} style={{ justifyContent: 'space-between' }}>
          <Txt style={{ flexShrink: 1 }}>{pick(locale, i.variant.product.title, i.variant.product.titleUr)} · {i.variant.name} × {i.quantity}</Txt>
          <Money paisa={i.variant.pricePaisa * i.quantity} />
        </Row>
      ))}
      <Txt style={{ fontWeight: '600' }}>{t('deliveryDate')}</Txt>
      <Row wrap>{days.map((d) => <Choice key={d} testID={`date-${d}`} label={d.slice(5)} selected={value.date === d} onPress={() => onChange({ date: d, slot: null })} />)}</Row>
      <Txt style={{ fontWeight: '600' }}>{t('slot')}</Txt>
      {!address ? null : slots === null ? <Loading /> : slots.length === 0 ? <Txt kind="muted">{t('noSlots')}</Txt> : (
        <Row wrap>{slots.map((s) => <Choice key={s.startMinute} testID={`slot-${s.startMinute}`} label={`${hhmm(s.startMinute)}–${hhmm(s.endMinute)}`} selected={value.slot === s.startMinute} onPress={() => onChange({ ...value, slot: s.startMinute })} />)}</Row>
      )}
    </Card>
  );
}

export default function Cart() {
  const { api, t, locale, loggedIn } = useApp();
  const [items, setItems] = useState<CartItem[] | null>(null);
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addr, setAddr] = useState({ recipientName: '', recipientPhone: '', line1: '', area: '' });
  const [plan, setPlan] = useState<Record<string, { date: string; slot: number | null }>>({});
  const [sender, setSender] = useState('');
  const [gift, setGift] = useState('');
  const [provider, setProvider] = useState<Provider>('MOCK');
  const [quote, setQuote] = useState<{ grandTotalPaisa: number; groups: { vendorId: string; deliveryChargePaisa: number }[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [methods, setMethods] = useState<Method[] | null>(null);
  useEffect(() => { void api.get<Method[]>('/payments/methods').then(setMethods).catch(() => setMethods([])); }, [api]);
  const wallets = walletProviders(methods);

  const load = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const [c, a] = await Promise.all([api.get<{ items: CartItem[] }>('/cart'), api.get<Address[]>('/me/addresses')]);
      setItems(c.items); setAddresses(a);
      setAddressId((cur) => cur ?? a[0]?.id ?? null);
    } catch (e) { setErr((e as Error).message); }
  }, [api, loggedIn]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const groups: Group[] = [];
  for (const i of items ?? []) {
    const p = i.variant.product;
    let g = groups.find((x) => x.vendorId === p.vendorId);
    if (!g) groups.push((g = { vendorId: p.vendorId, vendorName: pick(locale, p.vendor.name, p.vendor.nameUr), productId: p.id, items: [] }));
    g.items.push(i);
  }
  const address = addresses?.find((a) => a.id === addressId) ?? null;
  const planFor = (v: string) => plan[v] ?? { date: pktDate(1), slot: null };
  const ready = Boolean(address && groups.length && groups.every((g) => planFor(g.vendorId).slot !== null));
  const body = () => ({ groups: groups.map((g) => ({ vendorId: g.vendorId, addressId: address!.id, date: planFor(g.vendorId).date, slotStartMinute: planFor(g.vendorId).slot!, giftMessage: gift || undefined })) });
  const planKey = JSON.stringify([addressId, plan, groups.map((g) => g.vendorId)]);

  useEffect(() => {
    setQuote(null);
    if (!ready) return;
    void api.post<typeof quote>('/checkout/quote', body()).then(setQuote).catch((e) => setErr((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, ready]);

  if (!loggedIn) return <Screen><Txt>{t('loginToContinue')}</Txt><Button title={t('login')} onPress={() => router.push('/login')} /></Screen>;
  if (!items || !addresses) return <Screen><Loading /><ErrorText msg={err} /></Screen>;
  if (items.length === 0) return <Screen><Txt kind="muted">{t('emptyCart')}</Txt></Screen>;

  async function saveAddress() {
    setErr('');
    try {
      const a = await api.post<Address>('/me/addresses', addr);
      setAddresses([a, ...(addresses ?? [])]); setAddressId(a.id);
    } catch (e) { setErr((e as Error).message); }
  }
  async function place() {
    setErr(''); setBusy(true);
    try {
      const r = await api.post<{ orders: string[]; payment: { id: string; redirectUrl?: string } }>('/checkout', { ...body(), provider, senderName: sender, client: 'app', returnTo: paymentReturnUrl(), idempotencyKey: `m-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      setItems([]); setPlan({});
      if (r.payment.redirectUrl) { await openWalletPayment(r.payment.redirectUrl, r.payment.id); return; }
      router.push(`/order/${r.orders[0]}?new=1`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Screen>
      <Txt kind="h1">{t('cart')}</Txt>
      <Txt kind="h2">{t('deliverTo')}</Txt>
      {addresses.length > 0 && <Row wrap>{addresses.map((a) => <Choice key={a.id} label={`${a.recipientName} · ${a.area}`} selected={a.id === addressId} onPress={() => setAddressId(a.id)} />)}</Row>}
      {addresses.length === 0 && (
        <Card>
          <Field label={t('recipientName')} value={addr.recipientName} onChangeText={(v) => setAddr({ ...addr, recipientName: v })} />
          <Field label={t('recipientPhone')} keyboardType="phone-pad" value={addr.recipientPhone} onChangeText={(v) => setAddr({ ...addr, recipientPhone: v })} />
          <Field label={t('houseStreet')} value={addr.line1} onChangeText={(v) => setAddr({ ...addr, line1: v })} />
          <Field label={t('area')} placeholder="DHA, Gulberg III, Johar Town…" value={addr.area} onChangeText={(v) => setAddr({ ...addr, area: v })} />
          <Button title={t('saveAddress')} onPress={saveAddress} />
        </Card>
      )}
      {groups.map((g) => <VendorGroup key={g.vendorId} g={g} address={address} value={planFor(g.vendorId)} onChange={(v) => setPlan({ ...plan, [g.vendorId]: v })} />)}
      <Field label={t('giftMessage')} value={gift} onChangeText={setGift} maxLength={250} />
      <Field label={t('senderName')} value={sender} onChangeText={setSender} />
      <Txt kind="h2">{t('payment')}</Txt>
      <Row wrap>
        <Choice label={t('mockPay')} selected={provider === 'MOCK'} onPress={() => setProvider('MOCK')} />
        <Choice label={t('cod')} selected={provider === 'COD'} onPress={() => setProvider('COD')} />
        <Choice label={t('bankTransfer')} selected={provider === 'BANK_TRANSFER'} onPress={() => setProvider('BANK_TRANSFER')} />
        {wallets.map((w) => <Choice key={w} testID={`pay-${w}`} label={`${t(w === 'JAZZCASH' ? 'jazzcash' : 'easypaisa')} (${t('sandboxTag')})`} selected={provider === w} onPress={() => setProvider(w)} />)}
      </Row>
      {quote && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><Txt>{t('delivery')}</Txt><Money paisa={quote.groups.reduce((a, g) => a + g.deliveryChargePaisa, 0)} /></Row>
          <Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontWeight: '700' }}>{t('total')}</Txt><Money paisa={quote.grandTotalPaisa} style={{ fontSize: 18 }} /></Row>
        </Card>
      )}
      <Button title={t('placeOrder')} onPress={place} disabled={busy || !ready || !quote || !sender.trim()} />
      {provider === 'MOCK' && <Pill text="SANDBOX" />}
      <ErrorText msg={err} />
    </Screen>
  );
}
