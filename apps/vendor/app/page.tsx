import { redirect } from 'next/navigation';
import { Overview } from '@/components/client';
import { getLocale, isLoggedIn } from '@/lib/server';

export default async function Page() {
  if (!(await isLoggedIn())) redirect('/login');
  return <Overview locale={await getLocale()} />;
}
