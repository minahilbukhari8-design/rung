import { describe, expect, it } from 'vitest';
import { ACCESS, REFRESH, ApiError, createApi, type TokenStore } from '../src/lib/api';
import { hhmm, pktDate, pktInstant } from '../src/lib/dates';
import { DICT, pick, statusLabel } from '../src/lib/i18n';

function memStore(init: Record<string, string> = {}): TokenStore & { data: Record<string, string> } {
  const data = { ...init };
  return { data, get: async (k) => data[k] ?? null, set: async (k, v) => { data[k] = v; }, remove: async (k) => { delete data[k]; } };
}
const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe('api client', () => {
  it('stores tokens on verify and sends the bearer header', async () => {
    const calls: { url: string; headers?: Record<string, string> }[] = [];
    const store = memStore();
    const api = createApi({
      baseUrl: 'http://api.test/', store,
      fetch: async (url, init) => {
        calls.push({ url, headers: init?.headers });
        if (url.endsWith('/auth/otp/verify')) return json(200, { accessToken: 'a1', refreshToken: 'r1', user: { id: 'u', phone: '+92300', roles: ['CUSTOMER'] } });
        return json(200, { items: [] });
      },
    });
    const u = await api.verify('0300', '123456');
    expect(u.id).toBe('u');
    expect(store.data).toEqual({ [ACCESS]: 'a1', [REFRESH]: 'r1' });
    await api.get('/cart');
    expect(calls[1]).toMatchObject({ url: 'http://api.test/api/v1/cart', headers: { authorization: 'Bearer a1' } });
  });

  it('refreshes once on 401, rotating tokens, and shares one refresh across parallel calls', async () => {
    const store = memStore({ [ACCESS]: 'old', [REFRESH]: 'r1' });
    let refreshes = 0;
    const api = createApi({
      baseUrl: 'http://api.test', store,
      fetch: async (url, init) => {
        if (url.endsWith('/auth/refresh')) { refreshes++; return json(200, { accessToken: 'new', refreshToken: 'r2' }); }
        return init?.headers?.authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });
      },
    });
    const [a, b] = await Promise.all([api.get<{ ok: boolean }>('/orders'), api.get<{ ok: boolean }>('/bookings')]);
    expect(a.ok && b.ok).toBe(true);
    expect(refreshes).toBe(1);
    expect(store.data[REFRESH]).toBe('r2');
  });

  it('clears tokens and reports logout when refresh fails', async () => {
    const store = memStore({ [ACCESS]: 'old', [REFRESH]: 'bad' });
    let loggedOut = false;
    const api = createApi({ baseUrl: 'http://api.test', store, onLoggedOut: () => { loggedOut = true; }, fetch: async () => json(401, { error: { code: 'UNAUTHORIZED', message: 'no' } }) });
    await expect(api.get('/orders')).rejects.toBeInstanceOf(ApiError);
    expect(loggedOut).toBe(true);
    expect(store.data).toEqual({});
    expect(await api.isLoggedIn()).toBe(false);
  });

  it('surfaces the API error code and message', async () => {
    const api = createApi({ baseUrl: 'http://api.test', store: memStore(), fetch: async () => json(409, { error: { code: 'OUT_OF_STOCK', message: 'Only 1 left' } }) });
    await expect(api.post('/cart/items', {})).rejects.toMatchObject({ status: 409, code: 'OUT_OF_STOCK', message: 'Only 1 left' });
  });
});

describe('dates', () => {
  it('uses Pakistan time for dates and booking instants', () => {
    expect(pktDate(0, new Date('2026-11-15T20:30:00Z'))).toBe('2026-11-16'); // 01:30 PKT next day
    expect(pktDate(1, new Date('2026-11-15T10:00:00Z'))).toBe('2026-11-16');
    expect(hhmm(900)).toBe('15:00');
    expect(new Date(pktInstant('2026-12-01', '19:30')).toISOString()).toBe('2026-12-01T14:30:00.000Z');
  });
});

describe('i18n', () => {
  it('has every English key translated to Urdu, non-empty', () => {
    for (const k of Object.keys(DICT.en)) expect(DICT.ur[k as keyof typeof DICT.ur]?.trim().length, k).toBeGreaterThan(0);
  });
  it('falls back to English when a listing has no Urdu name', () => {
    expect(pick('ur', 'Cake', null)).toBe('Cake');
    expect(pick('ur', 'Cake', 'کیک')).toBe('کیک');
    expect(statusLabel('ur', 'DELIVERED')).toBe('پہنچ گیا');
  });
});
