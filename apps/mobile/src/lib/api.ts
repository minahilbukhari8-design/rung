/**
 * RUNG API client for the mobile app. No React Native imports here so it can be unit-tested.
 * Tokens live in a TokenStore (SecureStore on phones). On a 401 the client refreshes once and retries.
 */
export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const ACCESS = 'rung.access';
export const REFRESH = 'rung.refresh';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface User { id: string; phone: string; name?: string | null; roles: string[] }

export function createApi(opts: { baseUrl: string; store: TokenStore; fetch?: Fetch; onLoggedOut?: () => void }) {
  const f: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const base = opts.baseUrl.replace(/\/$/, '') + '/api/v1';
  let refreshing: Promise<boolean> | null = null;

  async function raw(method: string, path: string, body: unknown, token: string | null) {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    return f(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  /** One refresh at a time, shared by concurrent requests. */
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const rt = await opts.store.get(REFRESH);
      if (!rt) return false;
      const r = await raw('POST', '/auth/refresh', { refreshToken: rt }, null);
      if (!r.ok) {
        await opts.store.remove(ACCESS);
        await opts.store.remove(REFRESH);
        opts.onLoggedOut?.();
        return false;
      }
      const t = (await r.json()) as { accessToken: string; refreshToken: string };
      await opts.store.set(ACCESS, t.accessToken);
      await opts.store.set(REFRESH, t.refreshToken);
      return true;
    })().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res = await raw(method, path, body, await opts.store.get(ACCESS));
    if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) {
      res = await raw(method, path, body, await opts.store.get(ACCESS));
    }
    const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
    if (!res.ok) throw new ApiError(res.status, data.error?.code ?? 'HTTP_' + res.status, data.error?.message ?? 'Something went wrong');
    return data as T;
  }

  return {
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
    patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
    async requestCode(phone: string) {
      return request<{ phone: string }>('POST', '/auth/otp/request', { phone });
    },
    async verify(phone: string, code: string): Promise<User> {
      const r = await request<{ accessToken: string; refreshToken: string; user: User }>('POST', '/auth/otp/verify', { phone, code });
      await opts.store.set(ACCESS, r.accessToken);
      await opts.store.set(REFRESH, r.refreshToken);
      return r.user;
    },
    async logout() {
      const rt = await opts.store.get(REFRESH);
      if (rt) await raw('POST', '/auth/logout', { refreshToken: rt }, null).catch(() => undefined);
      await opts.store.remove(ACCESS);
      await opts.store.remove(REFRESH);
    },
    async isLoggedIn() {
      return Boolean((await opts.store.get(ACCESS)) || (await opts.store.get(REFRESH)));
    },
  };
}
export type Api = ReturnType<typeof createApi>;
