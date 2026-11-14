/**
 * External-service adapters. Only MOCK implementations exist until real accounts are opened
 * (see docs/ACCOUNTS_AND_KEYS.md). Nothing here contacts a real provider.
 */
import type { PaymentProvider } from '@prisma/client';

// ---------- SMS / OTP ----------
export interface SmsSender {
  readonly name: string;
  send(toE164: string, text: string): Promise<void>;
}

/** Keeps messages in memory so tests (and local dev) can read the OTP. */
export class MockSms implements SmsSender {
  readonly name = 'mock';
  readonly outbox: { to: string; text: string; at: Date }[] = [];
  async send(to: string, text: string) {
    this.outbox.push({ to, text, at: new Date() });
    if (process.env.NODE_ENV !== 'test') console.info(`[MOCK SMS → ${to}] ${text}`);
  }
  lastTo(to: string) {
    return [...this.outbox].reverse().find((m) => m.to === to);
  }
}

export function createSmsSender(): SmsSender {
  const p = process.env.OTP_PROVIDER ?? 'mock';
  if (p !== 'mock') throw new Error(`OTP_PROVIDER "${p}" is not implemented yet: no SMS account configured`);
  return new MockSms();
}

// ---------- Payments ----------
export interface PaymentInit {
  paymentId: string;
  amountPaisa: number;
  description: string;
}
export type PaymentInitResult =
  | { kind: 'succeeded'; providerRef: string } // instant (mock)
  | { kind: 'pending'; instructions: string } // bank transfer: wait for proof review
  | { kind: 'on_delivery' }; // COD

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  readonly isSandbox: boolean;
  init(p: PaymentInit): Promise<PaymentInitResult>;
  refund(providerRef: string | null, amountPaisa: number): Promise<{ providerRef: string }>;
}

export class MockGateway implements PaymentGateway {
  readonly provider = 'MOCK' as const;
  readonly isSandbox = true;
  /** Set to make the next init fail (tests). */
  failNext = false;
  async init(p: PaymentInit): Promise<PaymentInitResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('MOCK gateway declined');
    }
    return { kind: 'succeeded', providerRef: `mock_${p.paymentId}` };
  }
  async refund(_ref: string | null, amountPaisa: number) {
    return { providerRef: `mock_refund_${amountPaisa}_${Date.now()}` };
  }
}

export class CodGateway implements PaymentGateway {
  readonly provider = 'COD' as const;
  readonly isSandbox = false;
  async init(): Promise<PaymentInitResult> {
    return { kind: 'on_delivery' };
  }
  async refund(_ref: string | null, amountPaisa: number) {
    return { providerRef: `cod_nothing_to_refund_${amountPaisa}` };
  }
}

export class BankTransferGateway implements PaymentGateway {
  readonly provider = 'BANK_TRANSFER' as const;
  readonly isSandbox = false;
  async init(): Promise<PaymentInitResult> {
    // Real bank details are shown from config once the business account exists. Never invented.
    return { kind: 'pending', instructions: 'Upload your transfer receipt. Bank details will appear once RUNG’s business account is set up.' };
  }
  async refund(_ref: string | null, _amountPaisa: number) {
    return { providerRef: `manual_bank_refund_${Date.now()}` };
  }
}

export interface Adapters {
  sms: SmsSender;
  payments: Partial<Record<PaymentProvider, PaymentGateway>>;
}

export function createAdapters(): Adapters {
  return {
    sms: createSmsSender(),
    payments: { MOCK: new MockGateway(), COD: new CodGateway(), BANK_TRANSFER: new BankTransferGateway() },
  };
}
