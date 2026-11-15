import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { TokenStore } from './api';

/**
 * Phones: tokens in the OS keychain / keystore via SecureStore.
 * Web preview build only: localStorage (the real customer website uses httpOnly cookies instead).
 */
export const tokenStore: TokenStore =
  Platform.OS === 'web'
    ? {
        get: async (k) => globalThis.localStorage?.getItem(k) ?? null,
        set: async (k, v) => globalThis.localStorage?.setItem(k, v),
        remove: async (k) => globalThis.localStorage?.removeItem(k),
      }
    : {
        get: (k) => SecureStore.getItemAsync(k),
        set: (k, v) => SecureStore.setItemAsync(k, v),
        remove: (k) => SecureStore.deleteItemAsync(k),
      };
