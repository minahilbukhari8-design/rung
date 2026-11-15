import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useApp, useLoad } from '@/lib/app';
import { pick } from '@/lib/i18n';
import { Button, Choice, ErrorText, Field, Loading, Money, Pill, Row, Screen, Txt } from '@/ui/kit';

interface Product {
  id: string; title: string; titleUr?: string | null; description?: string | null; isDemo: boolean; leadTimeMinutes: number;
  vendor: { name: string; nameUr?: string | null; isVerified: boolean };
  variants: { id: string; name: string; pricePaisa: number; stock: number }[];
  customizations: { id: string; label: string; labelUr?: string | null; type: 'TEXT' | 'CHOICE' | 'IMAGE'; isRequired: boolean; maxLength?: number | null; extraPricePaisa: number; choices?: { value: string; label: string; extraPaisa?: number }[] | null }[];
}

export default function ProductScreen() {
  const { vendor, slug } = useLocalSearchParams<{ vendor: string; slug: string }>();
  const { api, t, locale, loggedIn } = useApp();
  const { data: p, error } = useLoad<Product>(`/products/${vendor}/${slug}`);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (error) return <Screen><ErrorText msg={error} /></Screen>;
  if (!p) return <Screen><Loading /></Screen>;
  const selected = p.variants.find((v) => v.id === (variantId ?? p.variants[0]?.id));
  async function add() {
    if (!loggedIn) return router.push('/login');
    setErr(''); setMsg('');
    try {
      const customization = Object.fromEntries(Object.entries(custom).filter(([, v]) => v.trim()));
      await api.post('/cart/items', { variantId: selected!.id, quantity: qty, customization });
      setMsg(t('added'));
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Screen>
      <Stack.Screen options={{ title: pick(locale, p.title, p.titleUr) }} />
      <Row wrap>{p.isDemo && <Pill text={t('demo')} tone="demo" />}{p.vendor.isVerified && <Pill text={t('verified')} tone="ok" />}</Row>
      <Txt kind="h1">{pick(locale, p.title, p.titleUr)}</Txt>
      <Txt kind="muted">{pick(locale, p.vendor.name, p.vendor.nameUr)}</Txt>
      {p.description && <Txt>{p.description}</Txt>}
      <Txt kind="h2">{t('chooseOption')}</Txt>
      <Row wrap>{p.variants.map((v) => <Choice key={v.id} testID={`variant-${v.name}`} label={`${v.name}`} selected={v.id === selected?.id} onPress={() => setVariantId(v.id)} />)}</Row>
      {selected && <Money paisa={selected.pricePaisa} style={{ fontSize: 20 }} />}
      {p.customizations.filter((c) => c.type === 'TEXT').map((c) => (
        <Field key={c.id} label={pick(locale, c.label, c.labelUr) + (c.isRequired ? ' *' : '')} maxLength={c.maxLength ?? 60} value={custom[c.id] ?? ''} onChangeText={(v) => setCustom({ ...custom, [c.id]: v })} />
      ))}
      {p.customizations.filter((c) => c.type === 'CHOICE').map((c) => (
        <Row key={c.id} wrap>
          <Txt style={{ fontWeight: '600' }}>{pick(locale, c.label, c.labelUr)}</Txt>
          {(c.choices ?? []).map((ch) => <Choice key={ch.value} label={ch.label} selected={custom[c.id] === ch.value} onPress={() => setCustom({ ...custom, [c.id]: ch.value })} />)}
        </Row>
      ))}
      <Row>
        <Txt>{t('quantity')}</Txt>
        <Button kind="secondary" title="−" onPress={() => setQty(Math.max(1, qty - 1))} />
        <Txt testID="qty">{qty}</Txt>
        <Button kind="secondary" title="+" onPress={() => setQty(Math.min(20, qty + 1))} />
      </Row>
      <Button title={t('addToCart')} onPress={add} disabled={!selected} />
      {msg ? <Txt style={{ fontWeight: '700' }}>{msg}</Txt> : null}
      <ErrorText msg={err} />
    </Screen>
  );
}
