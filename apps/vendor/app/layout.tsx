import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/client';
import { t, type Key } from '@/lib/i18n';
import { getLocale, isLoggedIn } from '@/lib/server';
import './globals.css';
import './vendor.css';

export const metadata: Metadata = { title: { default: 'RUNG for Vendors', template: '%s · RUNG Vendors' }, icons: { icon: '/favicon.svg' }, robots: { index: false } };
export const viewport: Viewport = { themeColor: '#2B1236', width: 'device-width', initialScale: 1 };

const NAV: [string, Key][] = [['/', 'overview'], ['/orders', 'orders'], ['/bookings', 'bookings'], ['/catalogue', 'catalogue'], ['/settings', 'settings'], ['/documents', 'documents'], ['/earnings', 'earnings']];

export default async function Layout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const loggedIn = await isLoggedIn();
  const path = (await headers()).get('x-pathname') ?? '/';
  return (
    <html lang={locale} dir={locale === 'ur' ? 'rtl' : 'ltr'}>
      <body>
        <header className="site">
          <div className="bar">
            <Link href="/" aria-label="RUNG vendors home"><img src="/brand/rung-logo-bilingual-on-dark.svg" alt="RUNG" style={{ height: 36, width: 'auto' }} /></Link>
            <strong style={{ color: 'var(--genda)' }}>{t(locale, 'appName')}</strong>
            <nav aria-label="Main">
              {loggedIn && NAV.map(([href, k]) => <Link key={href} href={href} aria-current={path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined}>{t(locale, k)}</Link>)}
              {loggedIn ? <LogoutButton label={t(locale, 'logout')} /> : <Link href="/login">{t(locale, 'login')}</Link>}
              <a href={`/locale?to=${locale === 'ur' ? 'en' : 'ur'}&back=${encodeURIComponent(path)}`}>{t(locale, 'language')}</a>
            </nav>
          </div>
        </header>
        <main className="wrap" style={{ paddingTop: 24 }}>{children}</main>
      </body>
    </html>
  );
}
