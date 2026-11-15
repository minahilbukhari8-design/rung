import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Refunds } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Refunds' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Refunds />;
}
