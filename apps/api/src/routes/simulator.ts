/**
 * LOCAL PAYMENT SIMULATOR (development and automated tests only; never registered in production).
 * Imitates the JazzCash and Easypaisa hosted pages using the SAME signing code as our adapters, so it proves
 * our redirect → callback → settle flow works end to end. It does NOT prove compatibility with the real gateways:
 * that needs the merchant sandboxes (see docs/PAYMENTS.md).
 */
import { createDecipheriv, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { jazzcashHash } from '../adapters/wallets.js';
import { autoPostPage } from './payments.js';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(title: string, amount: string, ref: string, approve: string, decline: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#f4f4f4}main{background:#fff;border-radius:12px;padding:20px;max-width:420px;margin:auto}
.warn{background:#fff3cd;padding:8px;border-radius:8px;font-size:13px}button{width:100%;padding:12px;margin-top:10px;border-radius:8px;border:0;font-size:16px;font-weight:700}</style></head>
<body><main><h1>${esc(title)}</h1><p class="warn">LOCAL SIMULATOR: not a real payment page. No money moves.</p>
<p>Reference <b>${esc(ref)}</b></p><p>Amount <b>Rs ${esc(amount)}</b></p>${approve}${decline}</main></body></html>`;
}

export async function simulatorRoutes(app: FastifyInstance) {
  // ---------- JazzCash ----------
  app.post('/sandbox-sim/jazzcash', async (req, reply) => {
    const f = req.body as Record<string, string>;
    const salt = process.env.JAZZCASH_INTEGRITY_SALT ?? '';
    if (f.pp_SecureHash !== jazzcashHash(f, salt)) return reply.code(400).type('text/html').send('<p>Simulator: request signature invalid</p>');
    const answer = (code: string, message: string) => {
      const r: Record<string, string> = {
        pp_Version: f.pp_Version, pp_TxnType: f.pp_TxnType, pp_Language: f.pp_Language, pp_MerchantID: f.pp_MerchantID, pp_SubMerchantID: '',
        pp_ProductID: '', pp_TxnRefNo: f.pp_TxnRefNo, pp_Amount: f.pp_Amount, pp_TxnCurrency: f.pp_TxnCurrency, pp_TxnDateTime: f.pp_TxnDateTime,
        pp_ResponseCode: code, pp_ResponseMessage: message, pp_RetreivalReferenceNo: code === '000' ? `SIM${Date.now()}` : '', pp_BillReference: f.pp_BillReference,
        pp_SettlementExpiry: '', ppmpf_1: '', ppmpf_2: '', ppmpf_3: '', ppmpf_4: '', ppmpf_5: '',
      };
      r.pp_SecureHash = jazzcashHash(r, salt);
      return `<form method="POST" action="${esc(f.pp_ReturnURL)}">${Object.entries(r).map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`).join('')}<button style="background:${code === '000' ? '#c8102e;color:#fff' : '#ddd'}">${code === '000' ? 'Approve payment' : 'Decline'}</button></form>`;
    };
    return reply.type('text/html').send(page('JazzCash (simulator)', (Number(f.pp_Amount) / 100).toFixed(2), f.pp_TxnRefNo, answer('000', 'Thank you for Using JazzCash, your transaction was successful.'), answer('199', 'Transaction declined by customer')));
  });

  // ---------- Easypaisa ----------
  const sessions = new Map<string, { ref: string; amount: string; postBackURL: string; status?: string }>();
  const paid = new Map<string, { amount: string; status: string; id: string }>();
  app.post('/sandbox-sim/easypaisa/index', async (req, reply) => {
    const f = req.body as Record<string, string>;
    const key = Buffer.from(process.env.EASYPAISA_HASH_KEY ?? '', 'utf8');
    const d = createDecipheriv('aes-128-ecb', key, null);
    const plain = Buffer.concat([d.update(Buffer.from(f.merchantHashedReq ?? '', 'base64')), d.final()]).toString('utf8');
    const expect = Object.keys(f).filter((k) => k !== 'merchantHashedReq' && f[k] !== '').sort().map((k) => `${k}=${f[k]}`).join('&');
    if (plain !== expect) return reply.code(400).type('text/html').send('<p>Simulator: merchantHashedReq invalid</p>');
    const token = randomUUID();
    sessions.set(token, { ref: f.orderRefNum, amount: f.amount, postBackURL: f.postBackURL });
    const btn = (ok: boolean) => `<form method="POST" action="/api/v1/sandbox-sim/easypaisa/decide"><input type="hidden" name="token" value="${token}"><input type="hidden" name="ok" value="${ok ? 1 : 0}"><button style="background:${ok ? '#3bb54a;color:#fff' : '#ddd'}">${ok ? 'Approve payment' : 'Decline'}</button></form>`;
    return reply.type('text/html').send(page('Easypaisa (simulator)', f.amount, f.orderRefNum, btn(true), btn(false)));
  });
  app.post('/sandbox-sim/easypaisa/decide', async (req, reply) => {
    const { token, ok } = req.body as Record<string, string>;
    const s = sessions.get(token);
    if (!s) return reply.code(404).send();
    s.status = ok === '1' ? 'PAID' : 'FAILED';
    // step 1: Easypay sends the browser back with auth_token
    return reply.code(303).header('location', `${s.postBackURL}?auth_token=${token}&orderRefNum=${encodeURIComponent(s.ref)}`).send();
  });
  app.post('/sandbox-sim/easypaisa/confirm', async (req, reply) => {
    const { auth_token, postBackURL } = req.body as Record<string, string>;
    const s = sessions.get(auth_token);
    if (!s) return reply.code(404).send();
    sessions.delete(auth_token);
    paid.set(s.ref, { amount: s.amount, status: s.status ?? 'FAILED', id: `EPSIM${Date.now()}` });
    // step 2: unsigned return; the API must check it with the inquiry call
    return reply.code(303).header('location', `${postBackURL}?status=${s.status === 'PAID' ? '0000' : '0001'}&desc=sim&orderRefNumber=${encodeURIComponent(s.ref)}`).send();
  });
  app.post('/sandbox-sim/easypaisa/inquire', async (req) => {
    const { orderId } = req.body as { orderId: string };
    const p = paid.get(orderId);
    if (!p) return { responseCode: '0001', transactionStatus: 'NOT_FOUND' };
    return { responseCode: '0000', transactionStatus: p.status, transactionAmount: p.amount, transactionId: p.id };
  });
}
