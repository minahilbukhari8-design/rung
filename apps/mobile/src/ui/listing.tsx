import { router } from 'expo-router';
import { useApp } from '@/lib/app';
import { pick } from '@/lib/i18n';
import { Card, Money, Pill, Row, Txt } from './kit';

export interface Listing { id: string; slug: string; title: string; titleUr?: string | null; isDemo: boolean; fromPricePaisa: number | null; vendor: { slug: string; name: string; nameUr?: string | null; isDemo: boolean; isVerified: boolean } }

export function ListingCard({ item, kind }: { item: Listing; kind: 'product' | 'service' }) {
  const { locale, t } = useApp();
  const title = pick(locale, item.title, item.titleUr);
  return (
    <Card testID={`${kind}-${item.slug}`} label={title} onPress={() => router.push(`/${kind}/${item.vendor.slug}/${item.slug}`)}>
      <Row wrap>{item.isDemo && <Pill text={t('demo')} tone="demo" />}{item.vendor.isVerified && <Pill text={t('verified')} tone="ok" />}</Row>
      <Txt style={{ fontWeight: '700' }}>{title}</Txt>
      <Txt kind="muted">{pick(locale, item.vendor.name, item.vendor.nameUr)}</Txt>
      {item.fromPricePaisa !== null && <Row><Txt kind="muted">{t('from')}</Txt><Money paisa={item.fromPricePaisa} /></Row>}
    </Card>
  );
}

