import { NextResponse, type NextRequest } from 'next/server';
import { LOCALE_COOKIE } from '@/lib/server';

/** GET /locale?to=ur&back=/path  → sets the language cookie and returns to the page. */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get('to') === 'ur' ? 'ur' : 'en';
  const back = req.nextUrl.searchParams.get('back') ?? '/';
  const safe = back.startsWith('/') && !back.startsWith('//') ? back : '/';
  const res = NextResponse.redirect(new URL(safe, req.url));
  res.cookies.set(LOCALE_COOKIE, to, { path: '/', maxAge: 365 * 24 * 3600, sameSite: 'lax' });
  return res;
}
