import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Log in' };

export default async function Page() {
  if (await isLoggedIn()) redirect('/');
  return (
    <section style={{ maxWidth: 420 }}>
      <h1>Admin log in</h1>
      <p className="muted">For the RUNG team only. Every action you take is recorded.</p>
      <LoginForm />
    </section>
  );
}
