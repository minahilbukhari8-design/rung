import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Payouts } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Payouts' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Payouts />;
}
