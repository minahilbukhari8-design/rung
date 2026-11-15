import { useLocalSearchParams } from 'expo-router';
import { useApp, useLoad } from '@/lib/app';
import { Loading, Screen, Txt } from '@/ui/kit';
import { ListingCard, type Listing } from '@/ui/listing';

export default function Occasion() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t } = useApp();
  const products = useLoad<{ items: Listing[] }>(`/products?occasion=${slug}`);
  const services = useLoad<{ items: Listing[] }>(`/services?occasion=${slug}`);
  return (
    <Screen>
      <Txt kind="h2">{t('products')}</Txt>
      {!products.data ? <Loading /> : products.data.items.length === 0 ? <Txt kind="muted">{t('none')}</Txt> : products.data.items.map((p) => <ListingCard key={p.id} item={p} kind="product" />)}
      <Txt kind="h2">{t('services')}</Txt>
      {!services.data ? <Loading /> : services.data.items.length === 0 ? <Txt kind="muted">{t('none')}</Txt> : services.data.items.map((s) => <ListingCard key={s.id} item={s} kind="service" />)}
    </Screen>
  );
}
