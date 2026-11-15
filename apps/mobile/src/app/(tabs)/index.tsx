import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { pick } from '@/lib/i18n';
import { useApp, useLoad } from '@/lib/app';
import { ErrorText, Loading, Row, Screen, Txt } from '@/ui/kit';
import { ListingCard, type Listing } from '@/ui/listing';
import { C, OCCASION_COLORS } from '@/ui/theme';

export default function Home() {
  const { t, locale } = useApp();
  const occ = useLoad<{ id: string; slug: string; name: string; nameUr: string }[]>('/occasions');
  const products = useLoad<{ items: Listing[] }>('/products?limit=12');
  const services = useLoad<{ items: Listing[] }>('/services?limit=12');
  return (
    <Screen>
      <View style={{ backgroundColor: C.shab, borderRadius: 20, padding: 18, gap: 6 }}>
        <Text role="heading" aria-level={1} style={{ color: C.dupatta, fontSize: 24, fontWeight: '800', textAlign: locale === 'ur' ? 'right' : 'left' }}>{t('tagline')}</Text>
        <Text style={{ color: C.genda, fontSize: 13, textAlign: locale === 'ur' ? 'right' : 'left' }}>{t('sandboxNote')}</Text>
      </View>
      <Txt kind="h2">{t('occasions')}</Txt>
      {occ.error ? <ErrorText msg={occ.error} /> : !occ.data ? <Loading /> : (
        <Row wrap>{occ.data.map((o, i) => (
          <Pressable key={o.id} role="link" aria-label={pick(locale, o.name, o.nameUr)} onPress={() => router.push(`/occasion/${o.slug}`)} style={{ backgroundColor: OCCASION_COLORS[i % OCCASION_COLORS.length], borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, minWidth: 100 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{pick(locale, o.name, o.nameUr)}</Text>
          </Pressable>
        ))}</Row>
      )}
      <Txt kind="h2">{t('products')}</Txt>
      {!products.data ? <Loading /> : products.data.items.map((p) => <ListingCard key={p.id} item={p} kind="product" />)}
      <Txt kind="h2">{t('services')}</Txt>
      {!services.data ? <Loading /> : services.data.items.map((s) => <ListingCard key={s.id} item={s} kind="service" />)}
    </Screen>
  );
}
