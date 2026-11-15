import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Documents } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'KYC documents' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Documents />;
}
