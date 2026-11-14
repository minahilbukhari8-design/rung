import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Documents } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Documents' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  const locale = await getLocale();
  return (
    <section>
      <h1>{t(locale, 'documents')}</h1>
      <Documents locale={locale} />
    </section>
  );
}
