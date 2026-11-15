import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Users } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Users' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Users />;
}
