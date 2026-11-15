/**
 * External-service adapters. Only MOCK implementations exist until real accounts are opened
 * (see docs/ACCOUNTS_AND_KEYS.md). Nothing here contacts a real provider.
 */
import type { AssistantEngine } from '../lib/assistant.js';
import type { PaymentProvider, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/core.js';
import { walletsFromEnv } from './wallets.js';

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
    // Local/e2e only: let browser tests read codes the mock "sent". Never set in production.
    if (process.env.MOCK_SMS_OUTBOX_FILE) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.MOCK_SMS_OUTBOX_FILE, JSON.stringify({ to, text }) + '\n');
    }
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
  | { kind: 'on_delivery' } // COD
  | { kind: 'redirect'; providerRef: string }; // wallet hosted page (JazzCash, Easypaisa): see wallets.ts

export interface PaymentGateway {
  readonly provider: PaymentProvider;
  readonly isSandbox: boolean;
  init(p: PaymentInit): Promise<PaymentInitResult>;
  refund(providerRef: string | null, amountPaisa: number): Promise<{ providerRef: string }>;
  /** true when money has to be sent back by hand (finance records it in the admin dashboard) */
  readonly manualRefunds?: boolean;
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
  readonly manualRefunds = true;
  async init(): Promise<PaymentInitResult> {
    // Real bank details are shown from config once the business account exists. Never invented.
    return { kind: 'pending', instructions: 'Upload your transfer receipt. Bank details will appear once RUNG’s business account is set up.' };
  }
  async refund(): Promise<{ providerRef: string }> {
    throw new Error('Bank transfer refunds are sent by hand and recorded by finance');
  }
}

// ---------- File storage ----------
export interface StoredFile {
  key: string;
  contentType: string;
  size: number;
}
export interface FileStorage {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  get(key: string): Promise<{ data: Buffer; contentType: string } | null>;
}

/** Local-disk storage for dev/tests until an S3-compatible bucket (Cloudflare R2) exists. */
export class LocalStorage implements FileStorage {
  readonly name = 'local';
  constructor(private dir = process.env.UPLOAD_DIR ?? '/tmp/rung-uploads') {}
  async put(key: string, data: Buffer, contentType: string) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(this.dir, key);
    if (!file.startsWith(path.resolve(this.dir))) throw new Error('bad key');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
    await writeFile(`${file}.type`, contentType);
    return { key, contentType, size: data.length };
  }
  async get(key: string) {
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const file = path.join(this.dir, key);
    if (!file.startsWith(path.resolve(this.dir))) return null;
    try {
      return { data: await readFile(file), contentType: (await readFile(`${file}.type`, 'utf8')).trim() };
    } catch {
      return null;
    }
  }
}

/** Files kept in Postgres (StoredFile). For free hosting where the server's disk is wiped on every restart. */
export class DbStorage implements FileStorage {
  readonly name = 'db';
  constructor(private db: Pick<PrismaClient, 'storedFile'>) {}
  async put(key: string, data: Buffer, contentType: string) {
    const bytes = new Uint8Array(data);
    await this.db.storedFile.upsert({ where: { key }, update: { data: bytes, contentType, size: data.length }, create: { key, data: bytes, contentType, size: data.length } });
    return { key, contentType, size: data.length };
  }
  async get(key: string) {
    const f = await this.db.storedFile.findUnique({ where: { key } });
    return f ? { data: Buffer.from(f.data), contentType: f.contentType } : null;
  }
}

export function createStorage(db: Pick<PrismaClient, 'storedFile'>): FileStorage {
  const kind = process.env.FILE_STORAGE ?? 'local';
  if (kind === 'db') return new DbStorage(db);
  if (kind === 'local') return new LocalStorage();
  throw new Error(`FILE_STORAGE "${kind}" is not implemented yet (use db or local)`);
}

export interface Adapters {
  sms: SmsSender;
  payments: Partial<Record<PaymentProvider, PaymentGateway>>;
  storage?: FileStorage;
  /** chat assistant; left out → Claude if ANTHROPIC_API_KEY is real, else the basic keyword helper */
  assistant?: AssistantEngine;
}

export function createAdapters(): Adapters {
  return {
    sms: createSmsSender(),
    payments: { MOCK: new MockGateway(), COD: new CodGateway(), BANK_TRANSFER: new BankTransferGateway(), ...walletsFromEnv() },
    storage: createStorage(prisma),
  };
}
