import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Vendors } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Vendors' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Vendors />;
}
