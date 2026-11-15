import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Bookings } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Bookings' };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isLoggedIn())) redirect('/login');
  const { status } = await searchParams;
  return <Bookings initialStatus={status ?? ''} />;
}
