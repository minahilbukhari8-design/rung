import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Orders } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Orders' };

export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  if (!(await isLoggedIn())) redirect('/login');
  const { status } = await searchParams;
  return <Orders initialStatus={status ?? ''} />;
}
