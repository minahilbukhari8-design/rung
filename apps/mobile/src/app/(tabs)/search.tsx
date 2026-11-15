import { router } from 'expo-router';
import { useState } from 'react';
import { useApp } from '@/lib/app';
import { pick } from '@/lib/i18n';
import { Button, Card, ErrorText, Field, Pill, Row, Screen, Txt } from '@/ui/kit';

interface Hit { id: string; slug: string; title: string; titleUr?: string | null; isDemo: boolean; vendor: { slug: string; name: string } }

export default function Search() {
  const { api, t, locale } = useApp();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ products: Hit[]; services: Hit[] } | null>(null);
  const [err, setErr] = useState('');
  async function go() {
    if (!q.trim()) return;
    try { setErr(''); setRes(await api.get(`/search?q=${encodeURIComponent(q.trim())}`)); } catch (e) { setErr((e as Error).message); }
  }
  const hit = (h: Hit, kind: 'product' | 'service') => (
    <Card key={h.id} testID={`hit-${h.slug}`} label={pick(locale, h.title, h.titleUr)} onPress={() => router.push(`/${kind}/${h.vendor.slug}/${h.slug}`)}>
      <Row wrap>{h.isDemo && <Pill text={t('demo')} tone="demo" />}<Txt style={{ fontWeight: '700' }}>{pick(locale, h.title, h.titleUr)}</Txt></Row>
      <Txt kind="muted">{h.vendor.name}</Txt>
    </Card>
  );
  return (
    <Screen>
      <Field label={t('search')} placeholder={t('searchPlaceholder')} value={q} onChangeText={setQ} onSubmitEditing={go} returnKeyType="search" autoCapitalize="none" />
      <Button title={t('search')} onPress={go} />
      <ErrorText msg={err} />
      {res && res.products.length + res.services.length === 0 && <Txt kind="muted">{t('noResults')}</Txt>}
      {res?.products.map((h) => hit(h, 'product'))}
      {res?.services.map((h) => hit(h, 'service'))}
    </Screen>
  );
}
