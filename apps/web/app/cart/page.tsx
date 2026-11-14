import { CartCheckout } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const locale = await getLocale();
  return (
    <section className="wrap">
      <h1>{t(locale, 'cart')}</h1>
      <CartCheckout locale={locale} />
    </section>
  );
}
