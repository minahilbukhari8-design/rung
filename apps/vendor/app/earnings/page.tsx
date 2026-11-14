import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Earnings } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Earnings' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  const locale = await getLocale();
  return (
    <section>
      <h1>{t(locale, 'earnings')}</h1>
      <Earnings locale={locale} />
    </section>
  );
}
