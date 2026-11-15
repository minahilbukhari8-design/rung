/**
 * Wallet payment flow (JazzCash, Easypaisa):
 *   checkout → redirectUrl (/payments/:id/go?t=…) → auto-posting form to the gateway's hosted page
 *   → gateway posts back to /payments/callback/:provider → signature checked → settlePayment → customer sent to the result page.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentProvider } from '@prisma/client';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Adapters } from '../adapters/index.js';
import { SignatureError, type CheckoutForm, type WalletGateway } from '../adapters/wallets.js';
import { notFound, parse, prisma, requireUser } from '../lib/core.js';
import { settlePayment } from '../lib/payments.js';

const PUBLIC_API_URL = () => (process.env.PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const WEB_PUBLIC_URL = () => (process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const START_TTL_MS = 30 * 60_000;

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set');
  return s;
}
function startToken(paymentId: string, exp: number) {
  return createHmac('sha256', secret()).update(`pay-start:${paymentId}:${exp}`).digest('base64url');
}

/** Link the customer's browser opens to reach the gateway page. Signed, expires in 30 minutes. */
export function paymentStartUrl(paymentId: string, _client: 'web' | 'app' = 'web', now = Date.now()): string {
  const exp = now + START_TTL_MS;
  return `${PUBLIC_API_URL()}/api/v1/payments/${paymentId}/go?exp=${exp}&t=${startToken(paymentId, exp)}`;
}

/** Where to send the customer after the gateway. The app may only return to its own scheme or listed origins. */
export function returnUrlFor(payment: { id: string; rawResponse: unknown }): string {
  const meta = (payment.rawResponse ?? {}) as { client?: string; returnTo?: string | null; init?: { client?: string; returnTo?: string | null } };
  const client = meta.client ?? meta.init?.client;
  const returnTo = meta.returnTo ?? meta.init?.returnTo;
  const allowed = ['rung://', ...(process.env.APP_RETURN_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
  if (client === 'app' && returnTo && allowed.some((a) => returnTo.startsWith(a))) {
    return `${returnTo}${returnTo.includes('?') ? '&' : '?'}payment=${payment.id}`;
  }
  return `${WEB_PUBLIC_URL()}/payment/result?payment=${payment.id}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A tiny page that posts a form to the gateway straight away (with a button if scripts are off). */
export function autoPostPage(form: CheckoutForm, title = 'Opening payment page…'): string {
  const inputs = Object.entries(form.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>RUNG payment</title>
<style>body{font-family:system-ui,sans-serif;background:#FBF4EA;color:#2B1236;display:grid;place-items:center;min-height:100vh;margin:0}button{background:#D6246E;color:#fff;border:0;border-radius:999px;padding:12px 22px;font-weight:700;font-size:16px}</style></head>
<body><form id="f" method="${form.method}" action="${esc(form.url)}">${inputs}<p>${esc(title)}</p><noscript><button type="submit">Continue</button></noscript></form>
<script>document.getElementById('f').submit()</script></body></html>`;
}

function redirectPage(reply: FastifyReply, url: string) {
  return reply.code(303).header('location', url).header('cache-control', 'no-store').type('text/html').send(`<!doctype html><meta charset="utf-8"><a href="${esc(url)}">Continue</a>`);
}

export async function paymentRoutes(app: FastifyInstance, adapters: Adapters) {
  // gateways post back as an HTML form
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 64 * 1024 }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });
  }

  const wallet = (provider: string): WalletGateway | null => {
    const gw = adapters.payments[provider.toUpperCase() as PaymentProvider] as WalletGateway | undefined;
    return gw && typeof gw.checkoutForm === 'function' ? gw : null;
  };

  /** Which payment methods checkout should offer right now. */
  app.get('/payments/methods', async () => {
    return Object.entries(adapters.payments).map(([provider, gw]) => ({ provider, isSandbox: gw!.isSandbox, kind: typeof (gw as WalletGateway).checkoutForm === 'function' ? 'wallet' : provider === 'COD' ? 'cash' : provider === 'BANK_TRANSFER' ? 'transfer' : 'instant' }));
  });

  app.get('/payments/:id', async (req) => {
    const u = requireUser(req);
    const { id } = req.params as { id: string };
    const p = await prisma.payment.findFirst({
      where: { id, OR: [{ orderGroup: { customerId: u.id } }, { booking: { customerId: u.id } }] },
      select: { id: true, provider: true, status: true, amountPaisa: true, isSandbox: true, failureReason: true, providerRef: true, orderGroup: { select: { orders: { select: { number: true, status: true } } } }, booking: { select: { number: true, status: true } } },
    });
    if (!p) throw notFound('Payment');
    return p;
  });

  app.get('/payments/:id/go', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { exp, t } = parse(z.object({ exp: z.coerce.number().int(), t: z.string().min(10) }), req.query);
    const want = startToken(id, exp);
    if (exp < Date.now() || want.length !== t.length || !timingSafeEqual(Buffer.from(want), Buffer.from(t))) {
      return reply.code(403).type('text/html').send('<!doctype html><meta charset="utf-8"><p>This payment link has expired. Please go back and try again.</p>');
    }
    const p = await prisma.payment.findUnique({ where: { id }, include: { orderGroup: { include: { orders: { select: { number: true } } } }, booking: { select: { number: true } } } });
    if (!p || !p.providerRef) throw notFound('Payment');
    if (p.status !== 'PENDING') return redirectPage(reply, returnUrlFor(p));
    const gw = wallet(p.provider);
    if (!gw) throw notFound('Payment method');
    const what = p.booking ? `RUNG booking ${p.booking.number}` : `RUNG order ${p.orderGroup?.orders.map((o) => o.number).join(' ') ?? ''}`;
    const form = gw.checkoutForm({ providerRef: p.providerRef, amountPaisa: p.amountPaisa, description: what, callbackUrl: `${PUBLIC_API_URL()}/api/v1/payments/callback/${p.provider.toLowerCase()}` });
    return reply.header('cache-control', 'no-store').type('text/html').send(autoPostPage(form));
  });

  const callback = async (req: { params: unknown; body: unknown; query: unknown }, reply: FastifyReply) => {
    const { provider } = req.params as { provider: string };
    const gw = wallet(provider);
    if (!gw) throw notFound('Payment method');
    const params = Object.fromEntries(Object.entries({ ...(req.query as object), ...((req.body as object) ?? {}) }).map(([k, v]) => [k, String(v)]));
    const callbackUrl = `${PUBLIC_API_URL()}/api/v1/payments/callback/${provider.toLowerCase()}`;
    let result;
    try {
      result = await gw.handleCallback(params, { callbackUrl });
    } catch (e) {
      await prisma.auditLog.create({ data: { action: 'payment.bad_callback', entity: 'Payment', entityId: provider.toUpperCase(), data: { error: (e as Error).message } } });
      const code = e instanceof SignatureError ? 400 : 502;
      return reply.code(code).type('text/html').send('<!doctype html><meta charset="utf-8"><p>We could not confirm this payment. If money left your account, contact RUNG support with your wallet receipt.</p>');
    }
    const payment = await prisma.payment.findFirst({ where: { provider: gw.provider, providerRef: result.providerRef } });
    if (!payment) return reply.code(404).type('text/html').send('<!doctype html><meta charset="utf-8"><p>Payment not found.</p>');
    if (result.kind === 'continue') return reply.header('cache-control', 'no-store').type('text/html').send(autoPostPage(result.form, 'Confirming with Easypaisa…'));
    if (result.kind === 'settle') {
      await settlePayment(adapters, payment.id, result.outcome, { type: 'SYSTEM' });
    }
    return redirectPage(reply, returnUrlFor(payment));
  };
  app.post('/payments/callback/:provider', callback);
  app.get('/payments/callback/:provider', callback);
}
