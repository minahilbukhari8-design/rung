import { LoginForm } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale } from '@/lib/server';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const locale = await getLocale();
  const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return (
    <section className="wrap" style={{ maxWidth: 440 }}>
      <h1>{t(locale, 'login')}</h1>
      <LoginForm locale={locale} next={safe} />
    </section>
  );
}
