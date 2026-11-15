import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/client';
import { t } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'RUNG · Har Khushi, Har Rang', template: '%s · RUNG' },
  description: 'Cakes, flowers, gifts, decor, mehndi, catering and photography for every celebration in Lahore.',
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
};
export const viewport: Viewport = { themeColor: '#2B1236', width: 'device-width', initialScale: 1 };

const STRIPE = ['--rani', '--genda', '--firozi', '--kesar', '--mehndi', '--zari'];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const loggedIn = await isLoggedIn();
  const path = (await headers()).get('x-pathname') ?? '/';
  return (
    <html lang={locale} dir={locale === 'ur' ? 'rtl' : 'ltr'}>
      <body>
        <header className="site">
          <div className="bar">
            <Link href="/" aria-label="RUNG home">
              <img src="/brand/rung-logo-bilingual-on-dark.svg" alt="RUNG رنگ" height={40} width={150} style={{ height: 40, width: 'auto' }} />
            </Link>
            <form action="/search" role="search">
              <input name="q" type="search" placeholder={t(locale, 'searchPlaceholder')} aria-label={t(locale, 'search')} />
            </form>
            <nav aria-label="Main">
              <Link href="/products">{t(locale, 'products')}</Link>
              <Link href="/services">{t(locale, 'services')}</Link>
              <Link href="/assistant">{t(locale, 'assistant')}</Link>
              <Link href="/cart">{t(locale, 'cart')}</Link>
              {loggedIn ? (
                <>
                  <Link href="/orders">{t(locale, 'myOrders')}</Link>
                  <Link href="/bookings">{t(locale, 'myBookings')}</Link>
                  <LogoutButton label={t(locale, 'logout')} />
                </>
              ) : (
                <Link href="/login">{t(locale, 'login')}</Link>
              )}
              <a href={`/locale?to=${locale === 'ur' ? 'en' : 'ur'}&back=${encodeURIComponent(path)}`} lang={locale === 'ur' ? 'en' : 'ur'}>
                {t(locale, 'language')}
              </a>
            </nav>
          </div>
          <div className="stripe" aria-hidden>{STRIPE.map((c) => <span key={c} style={{ background: `var(${c})` }} />)}</div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="wrap">
            <img src="/brand/rung-logo-bilingual-on-dark.svg" alt="RUNG" />
            <p>{t(locale, 'tagline')} · Lahore</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
