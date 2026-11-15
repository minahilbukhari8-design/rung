import { getLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { createApi, type Api } from './api';
import { t as translate, type Key, type Locale } from './i18n';
import { tokenStore } from './store';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const LOCALE_KEY = 'rung.locale';

interface AppState {
  api: Api;
  locale: Locale;
  rtl: boolean;
  t: (k: Key) => string;
  toggleLocale: () => void;
  loggedIn: boolean | null;
  setLoggedIn: (v: boolean) => void;
}
const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => (getLocales()[0]?.languageCode === 'ur' ? 'ur' : 'en'));
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const api = useMemo(() => createApi({ baseUrl: API_URL, store: tokenStore, onLoggedOut: () => setLoggedIn(false) }), []);

  useEffect(() => {
    void tokenStore.get(LOCALE_KEY).then((l) => { if (l === 'en' || l === 'ur') setLocale(l); });
    void api.isLoggedIn().then(setLoggedIn);
  }, [api]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = locale === 'ur' ? 'rtl' : 'ltr';
    }
  }, [locale]);

  const toggleLocale = useCallback(() => {
    setLocale((l) => {
      const next = l === 'ur' ? 'en' : 'ur';
      void tokenStore.set(LOCALE_KEY, next);
      return next;
    });
  }, []);
  const value = useMemo<AppState>(() => ({ api, locale, rtl: locale === 'ur', t: (k) => translate(locale, k), toggleLocale, loggedIn, setLoggedIn }), [api, locale, toggleLocale, loggedIn]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

/** Loads data from the API; reloads when `path` changes. `null` skips loading. */
export function useLoad<T>(path: string | null) {
  const { api } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!path) return;
    try { setError(''); setData(await api.get<T>(path)); } catch (e) { setError((e as Error).message); }
  }, [api, path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, reload };
}
