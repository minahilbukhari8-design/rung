import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/client';
import { isLoggedIn } from '@/lib/server';
import './globals.css';
import './admin.css';

export const metadata: Metadata = { title: { default: 'RUNG Admin', template: '%s · RUNG Admin' }, icons: { icon: '/favicon.svg' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: '#2B1236', width: 'device-width', initialScale: 1 };

const NAV: [string, string][] = [['/', 'Overview'], ['/vendors', 'Vendors'], ['/documents', 'KYC'], ['/orders', 'Orders'], ['/bookings', 'Bookings'], ['/payments', 'Payments'], ['/refunds', 'Refunds'], ['/payouts', 'Payouts'], ['/users', 'Users'], ['/audit', 'Audit log']];

export default async function Layout({ children }: { children: ReactNode }) {
  const loggedIn = await isLoggedIn();
  const path = (await headers()).get('x-pathname')?.split('?')[0] ?? '/';
  return (
    <html lang="en" dir="ltr">
      <body>
        <header className="site">
          <div className="bar">
            <Link href="/" aria-label="RUNG admin home"><img src="/brand/rung-logo-bilingual-on-dark.svg" alt="RUNG" style={{ height: 36, width: 'auto' }} /></Link>
            <strong style={{ color: 'var(--genda)' }}>Admin</strong>
            <nav aria-label="Main">
              {loggedIn && NAV.map(([href, label]) => <Link key={href} href={href} aria-current={path === href || (href !== '/' && path.startsWith(href)) ? 'page' : undefined}>{label}</Link>)}
              {loggedIn ? <LogoutButton /> : <Link href="/login">Log in</Link>}
            </nav>
          </div>
        </header>
        <main className="wrap" style={{ paddingTop: 24, paddingBottom: 48 }}>{children}</main>
      </body>
    </html>
  );
}
