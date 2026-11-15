/**
 * Mobile-wallet gateways: JazzCash (hosted checkout / page redirection) and Easypaisa (Easypay hosted checkout).
 *
 * STATUS: written against public merchant integration code, NOT tested against the real sandboxes,
 * because RUNG has no merchant accounts yet. Both are switched off unless their env vars are set.
 * Before going live, run the checklist in docs/PAYMENTS.md inside each merchant sandbox.
 */
import { createCipheriv, createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentGateway, PaymentInit, PaymentInitResult } from './index.js';
import type { SettleOutcome } from '../lib/payments.js';

export interface CheckoutForm {
  url: string;
  method: 'POST' | 'GET';
  fields: Record<string, string>;
}

export type CallbackResult =
  | { kind: 'settle'; providerRef: string; outcome: SettleOutcome }
  /** not final yet (e.g. a JazzCash voucher the customer still has to pay): keep the payment PENDING */
  | { kind: 'pending'; providerRef: string; message: string }
  /** the gateway needs another browser hop (Easypaisa step 2) */
  | { kind: 'continue'; providerRef: string; form: CheckoutForm };

export interface WalletGateway extends PaymentGateway {
  /** Form the customer's browser posts to the gateway's hosted page. */
  checkoutForm(p: { providerRef: string; amountPaisa: number; description: string; callbackUrl: string; now?: Date }): CheckoutForm;
  /** Verifies what the gateway sent back. Throws on a bad signature. */
  handleCallback(params: Record<string, string>, ctx: { callbackUrl: string }): Promise<CallbackResult>;
}

export class SignatureError extends Error {}

/** YYYYMMDDHHmmss in Pakistan time. */
export function pktStamp(d: Date): string {
  return new Date(d.getTime() + 5 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Short unique reference (max 20 chars) the gateway shows the customer; stored as Payment.providerRef. */
export function walletRef(prefix: 'T' | 'E', now = new Date()): string {
  return `${prefix}${pktStamp(now)}${Math.floor(Math.random() * 1e5).toString().padStart(5, '0')}`;
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ---------------------------------------------------------------- JazzCash
export interface JazzCashConfig { merchantId: string; password: string; integritySalt: string; postUrl: string; sandbox: boolean }

/**
 * pp_SecureHash = upper(hex(HMAC-SHA256(key = salt, msg = salt + "&" + values of all non-empty pp_* and ppmpf_* fields,
 * sorted by field name, joined with "&"))). pp_SecureHash itself is excluded.
 */
export function jazzcashHash(fields: Record<string, string>, salt: string): string {
  const values = Object.keys(fields)
    .filter((k) => (k.startsWith('pp_') || k.startsWith('ppmpf_')) && k !== 'pp_SecureHash' && fields[k] !== '' && fields[k] != null)
    .sort()
    .map((k) => fields[k]);
  return createHmac('sha256', salt).update([salt, ...values].join('&')).digest('hex').toUpperCase();
}

export class JazzCashGateway implements WalletGateway {
  readonly provider = 'JAZZCASH' as const;
  readonly manualRefunds = true; // refund API not verified yet: finance refunds from the JazzCash merchant portal
  constructor(private cfg: JazzCashConfig) {}
  get isSandbox() { return this.cfg.sandbox; }

  async init(_p: PaymentInit): Promise<PaymentInitResult> {
    return { kind: 'redirect', providerRef: walletRef('T') };
  }

  checkoutForm(p: { providerRef: string; amountPaisa: number; description: string; callbackUrl: string; now?: Date }): CheckoutForm {
    const now = p.now ?? new Date();
    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MWALLET',
      pp_Language: 'EN',
      pp_MerchantID: this.cfg.merchantId,
      pp_SubMerchantID: '',
      pp_Password: this.cfg.password,
      pp_BankID: '',
      pp_ProductID: '',
      pp_TxnRefNo: p.providerRef,
      pp_Amount: String(p.amountPaisa), // JazzCash amounts are in paisa
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: pktStamp(now),
      pp_BillReference: p.providerRef,
      pp_Description: p.description.replace(/[^\w .,-]/g, '').slice(0, 100),
      pp_TxnExpiryDateTime: pktStamp(new Date(now.getTime() + 60 * 60_000)),
      pp_ReturnURL: p.callbackUrl,
      ppmpf_1: '', ppmpf_2: '', ppmpf_3: '', ppmpf_4: '', ppmpf_5: '',
    };
    fields.pp_SecureHash = jazzcashHash(fields, this.cfg.integritySalt);
    return { url: this.cfg.postUrl, method: 'POST', fields };
  }

  async handleCallback(params: Record<string, string>): Promise<CallbackResult> {
    const got = String(params.pp_SecureHash ?? '').toUpperCase();
    if (!got || !safeEqual(got, jazzcashHash(params, this.cfg.integritySalt))) throw new SignatureError('JazzCash signature does not match');
    if (params.pp_MerchantID && params.pp_MerchantID !== this.cfg.merchantId) throw new SignatureError('JazzCash merchant id does not match');
    const providerRef = params.pp_TxnRefNo;
    if (!providerRef) throw new SignatureError('JazzCash response has no pp_TxnRefNo');
    const code = params.pp_ResponseCode;
    const raw = { ...params, pp_Password: undefined };
    if (code === '000') {
      return { kind: 'settle', providerRef, outcome: { status: 'SUCCEEDED', providerRef: params.pp_RetreivalReferenceNo || providerRef, amountPaisa: Number(params.pp_Amount), raw, note: 'Paid with JazzCash' } };
    }
    if (code === '124' || code === '157') {
      // voucher issued / awaiting customer: not paid yet, keep pending
      return { kind: 'pending', providerRef, message: `JazzCash ${code}: ${params.pp_ResponseMessage ?? 'awaiting payment'}` };
    }
    return { kind: 'settle', providerRef, outcome: { status: 'FAILED', reason: `JazzCash ${code ?? '?'}: ${params.pp_ResponseMessage ?? 'payment not completed'}`, raw } };
  }

  async refund(): Promise<{ providerRef: string }> {
    throw new Error('JazzCash refunds are made in the merchant portal and recorded by finance');
  }
}

// ---------------------------------------------------------------- Easypaisa
export interface EasypaisaConfig { storeId: string; hashKey: string; indexUrl: string; confirmUrl: string; inquiryUrl: string; username: string; password: string; accountNum: string; sandbox: boolean }

/** merchantHashedReq = base64(AES-128-ECB/PKCS5(key = hashKey, "k1=v1&k2=v2…" with keys sorted)). */
export function easypaisaHash(fields: Record<string, string>, hashKey: string): string {
  const str = Object.keys(fields).filter((k) => k !== 'merchantHashedReq' && fields[k] !== '').sort().map((k) => `${k}=${fields[k]}`).join('&');
  const key = Buffer.from(hashKey, 'utf8');
  if (key.length !== 16) throw new Error('EASYPAISA_HASH_KEY must be 16 characters');
  const c = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([c.update(str, 'utf8'), c.final()]).toString('base64');
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export class EasypaisaGateway implements WalletGateway {
  readonly provider = 'EASYPAISA' as const;
  readonly manualRefunds = true; // refunds are made in the Easypaisa merchant portal
  constructor(private cfg: EasypaisaConfig, private fetchFn: Fetch = (u, i) => fetch(u, i)) {}
  get isSandbox() { return this.cfg.sandbox; }

  async init(): Promise<PaymentInitResult> {
    return { kind: 'redirect', providerRef: walletRef('E') };
  }

  checkoutForm(p: { providerRef: string; amountPaisa: number; callbackUrl: string; now?: Date }): CheckoutForm {
    const now = p.now ?? new Date();
    const fields: Record<string, string> = {
      storeId: this.cfg.storeId,
      amount: (p.amountPaisa / 100).toFixed(1), // Easypay takes rupees with one decimal
      postBackURL: p.callbackUrl,
      orderRefNum: p.providerRef,
      expiryDate: pktStamp(new Date(now.getTime() + 60 * 60_000)).replace(/^(\d{8})(\d{6})$/, '$1 $2'),
      autoRedirect: '1',
    };
    fields.merchantHashedReq = easypaisaHash(fields, this.cfg.hashKey);
    return { url: this.cfg.indexUrl, method: 'POST', fields };
  }

  /**
   * Step 1: Easypay posts `auth_token` back → we send the browser to Confirm.jsf.
   * Step 2: Easypay returns `status` + `orderRefNumber`. That return is NOT signed, so we never trust it:
   * the result comes from the Inquire Transaction API, called server-to-server.
   */
  async handleCallback(params: Record<string, string>, ctx: { callbackUrl: string }): Promise<CallbackResult> {
    if (params.auth_token) {
      const ref = params.orderRefNum ?? params.orderRefNumber ?? '';
      return { kind: 'continue', providerRef: ref, form: { url: this.cfg.confirmUrl, method: 'POST', fields: { auth_token: params.auth_token, postBackURL: ctx.callbackUrl } } };
    }
    const ref = params.orderRefNumber ?? params.orderRefNum;
    if (!ref) throw new SignatureError('Easypaisa return has no order reference');
    const r = await this.inquire(ref);
    if (r.status === 'PAID') return { kind: 'settle', providerRef: ref, outcome: { status: 'SUCCEEDED', providerRef: r.transactionId ?? ref, amountPaisa: r.amountPaisa, raw: r.raw, note: 'Paid with Easypaisa' } };
    return { kind: 'settle', providerRef: ref, outcome: { status: 'FAILED', reason: `Easypaisa: ${r.status}`, raw: r.raw } };
  }

  async inquire(orderRef: string): Promise<{ status: string; amountPaisa?: number; transactionId?: string; raw: unknown }> {
    const res = await this.fetchFn(this.cfg.inquiryUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Credentials: Buffer.from(`${this.cfg.username}:${this.cfg.password}`).toString('base64') },
      body: JSON.stringify({ orderId: orderRef, storeId: this.cfg.storeId, accountNum: this.cfg.accountNum }),
    });
    if (!res.ok) throw new Error('Easypaisa inquiry failed');
    const d = (await res.json()) as { transactionStatus?: string; transactionAmount?: string | number; transactionId?: string; responseCode?: string };
    const amount = d.transactionAmount === undefined ? undefined : Math.round(Number(d.transactionAmount) * 100);
    return { status: d.responseCode === '0000' && d.transactionStatus === 'PAID' ? 'PAID' : (d.transactionStatus ?? 'UNKNOWN'), amountPaisa: amount, transactionId: d.transactionId, raw: d };
  }

  async refund(): Promise<{ providerRef: string }> {
    throw new Error('Easypaisa refunds are made in the merchant portal and recorded by finance');
  }
}

// ---------------------------------------------------------------- config
/** Builds the wallet gateways that are configured. Missing config → not offered at checkout. */
export function walletsFromEnv(env: NodeJS.ProcessEnv = process.env): Partial<Record<'JAZZCASH' | 'EASYPAISA', WalletGateway>> {
  const out: Partial<Record<'JAZZCASH' | 'EASYPAISA', WalletGateway>> = {};
  const real = (v?: string) => Boolean(v && !v.startsWith('PLACEHOLDER'));
  if (real(env.JAZZCASH_MERCHANT_ID) && real(env.JAZZCASH_PASSWORD) && real(env.JAZZCASH_INTEGRITY_SALT)) {
    out.JAZZCASH = new JazzCashGateway({
      merchantId: env.JAZZCASH_MERCHANT_ID!, password: env.JAZZCASH_PASSWORD!, integritySalt: env.JAZZCASH_INTEGRITY_SALT!,
      postUrl: env.JAZZCASH_POST_URL ?? 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/',
      sandbox: env.JAZZCASH_MODE !== 'live',
    });
  }
  if (real(env.EASYPAISA_STORE_ID) && real(env.EASYPAISA_HASH_KEY)) {
    const base = env.EASYPAISA_BASE_URL ?? 'https://easypaystg.easypaisa.com.pk';
    out.EASYPAISA = new EasypaisaGateway({
      storeId: env.EASYPAISA_STORE_ID!, hashKey: env.EASYPAISA_HASH_KEY!,
      indexUrl: env.EASYPAISA_INDEX_URL ?? `${base}/easypay/Index.jsf`, confirmUrl: env.EASYPAISA_CONFIRM_URL ?? `${base}/easypay/Confirm.jsf`,
      inquiryUrl: env.EASYPAISA_INQUIRY_URL ?? `${base}/easypay-service/rest/v4/inquire-transaction`,
      username: env.EASYPAISA_USERNAME ?? '', password: env.EASYPAISA_PASSWORD ?? '', accountNum: env.EASYPAISA_ACCOUNT_NUM ?? '',
      sandbox: env.EASYPAISA_MODE !== 'live',
    });
  }
  return out;
}
