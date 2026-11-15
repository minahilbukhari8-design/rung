/**
 * Backend-for-frontend proxy. The browser never sees access/refresh tokens: they live in
 * httpOnly cookies, and this route adds the bearer header when calling the API.
 * Login (otp/verify) and logout are intercepted to set/clear the cookies.
 */
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, API_URL, REFRESH_COOKIE } from '@/lib/server';

const secure = process.env.NODE_ENV === 'production';
const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge });

async function forward(req: NextRequest, path: string, body: string | undefined, token?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) headers['x-forwarded-for'] = fwd;
  return fetch(`${API_URL}/api/v1/${path}${req.nextUrl.search}`, { method: req.method, headers, body, cache: 'no-store' });
}

async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const path = (await ctx.params).path.join('/');
  if (req.method !== 'GET' && req.headers.get('origin') && new URL(req.headers.get('origin')!).host !== req.headers.get('host')) {
    return NextResponse.json({ error: { code: 'BAD_ORIGIN', message: 'Cross-site request blocked' } }, { status: 403 });
  }
  const jar = await cookies();
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text();
  let token = jar.get(ACCESS_COOKIE)?.value;
  let res = await forward(req, path, body, token);
  let newTokens: { accessToken: string; refreshToken: string } | null = null;

  // silent refresh once on 401
  if (res.status === 401 && jar.get(REFRESH_COOKIE)?.value && !path.startsWith('auth/')) {
    const r = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: jar.get(REFRESH_COOKIE)!.value }) });
    if (r.ok) {
      newTokens = await r.json();
      token = newTokens!.accessToken;
      res = await forward(req, path, body, token);
    }
  }

  // binary-safe: KYC documents (PDF / images) pass through unchanged
  const raw = await res.arrayBuffer();
  if (path === 'auth/otp/verify' && res.ok) {
    const data = JSON.parse(new TextDecoder().decode(raw));
    const out = NextResponse.json({ user: data.user });
    out.cookies.set(ACCESS_COOKIE, data.accessToken, cookieOpts(15 * 60));
    out.cookies.set(REFRESH_COOKIE, data.refreshToken, cookieOpts(30 * 24 * 3600));
    return out;
  }
  if (path === 'auth/logout') {
    const rt = jar.get(REFRESH_COOKIE)?.value;
    if (rt) await fetch(`${API_URL}/api/v1/auth/logout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) });
    const out = NextResponse.json({ ok: true });
    out.cookies.delete(ACCESS_COOKIE);
    out.cookies.delete(REFRESH_COOKIE);
    return out;
  }
  const headers: Record<string, string> = { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' };
  if (path.startsWith('files/')) headers['content-disposition'] = 'inline';
  const out = new NextResponse(raw, { status: res.status, headers });
  if (newTokens) {
    out.cookies.set(ACCESS_COOKIE, newTokens.accessToken, cookieOpts(15 * 60));
    out.cookies.set(REFRESH_COOKIE, newTokens.refreshToken, cookieOpts(30 * 24 * 3600));
  }
  return out;
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };
