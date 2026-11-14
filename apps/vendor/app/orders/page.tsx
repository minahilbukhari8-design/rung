import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { OrdersBoard } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Orders' };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isLoggedIn())) redirect('/login');
  const locale = await getLocale();
  const { status } = await searchParams;
  return (
    <section>
      <h1>{t(locale, 'orders')}</h1>
      <OrdersBoard locale={locale} initialStatus={status ?? 'PLACED'} />
    </section>
  );
}
