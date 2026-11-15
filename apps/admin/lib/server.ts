import 'server-only';
import { cookies } from 'next/headers';


export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
export const ACCESS_COOKIE = 'rung_admin_at';
export const REFRESH_COOKIE = 'rung_admin_rt';



export async function isLoggedIn(): Promise<boolean> {
  const c = await cookies();
  return Boolean(c.get(ACCESS_COOKIE)?.value || c.get(REFRESH_COOKIE)?.value);
}

/** Server-side GET to the RUNG API. Public data is revalidated every 60 s. */
/** `fresh` skips the cache: used for pages showing prices, stock or IDs the user will act on. */
export async function apiGet<T>(path: string, opts: { auth?: boolean; fresh?: boolean } = {}): Promise<T | null> {
  const headers: Record<string, string> = {};
  if (opts.auth) {
    const at = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (!at) return null;
    headers.authorization = `Bearer ${at}`;
  }
  const res = await fetch(`${API_URL}/api/v1${path}`, { headers, ...(opts.auth || opts.fresh ? { cache: 'no-store' as const } : { next: { revalidate: 60 } }) });
  if (res.status === 404 || res.status === 401) return null;
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}
