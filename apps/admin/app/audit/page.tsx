import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuditLog } from '@/components/client';
import { isLoggedIn } from '@/lib/server';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <AuditLog />;
}
