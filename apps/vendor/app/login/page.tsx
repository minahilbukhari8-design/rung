import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Log in' };

export default async function Page() {
  if (await isLoggedIn()) redirect('/');
  const locale = await getLocale();
  return (
    <section style={{ maxWidth: 420 }}>
      <h1>{t(locale, 'login')}</h1>
      <LoginForm locale={locale} />
    </section>
  );
}
