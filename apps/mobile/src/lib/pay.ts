/**
 * Wallet payments in the app (JazzCash, Easypaisa).
 * The API gives a signed start link. On a phone we open it in an in-app browser session that closes itself
 * when the gateway sends the customer back to rung://payment-result. On the web build we just navigate there.
 * The result screen always asks the API for the real status: the return trip itself proves nothing.
 */
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

export type Provider = 'COD' | 'MOCK' | 'BANK_TRANSFER' | 'JAZZCASH' | 'EASYPAISA';
export interface Method { provider: Provider; isSandbox: boolean; kind: 'wallet' | 'cash' | 'transfer' | 'instant' }

/** Where the gateway should send the customer back to. The API only accepts rung:// or listed origins. */
export function paymentReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/payment-result`;
  return Linking.createURL('payment-result');
}

export function walletProviders(methods: Method[] | null): Provider[] {
  return (methods ?? []).filter((m) => m.kind === 'wallet').map((m) => m.provider);
}

export async function openWalletPayment(redirectUrl: string, paymentId: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(redirectUrl);
    return;
  }
  // whatever happened in the browser (paid, declined, closed), the result screen checks with the API
  await WebBrowser.openAuthSessionAsync(redirectUrl, paymentReturnUrl());
  router.replace(`/payment-result?payment=${encodeURIComponent(paymentId)}`);
}
