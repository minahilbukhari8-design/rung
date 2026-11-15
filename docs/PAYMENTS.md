# Payments in RUNG

_Milestone 8, 15 Nov 2026. Sandbox only. No real money moves._

## What a customer can use today

| Method | Status |
|---|---|
| Test payment (MOCK) | Works. Marked "sandbox, no real money" everywhere. |
| Cash on delivery | Works. |
| Bank transfer | Works. Finance confirms or rejects it in the admin dashboard; refunds are recorded by hand. |
| JazzCash wallet | **Built, not connected.** Tested only against RUNG's local simulator. Hidden until real sandbox credentials are set. |
| Easypaisa wallet | **Built, not connected.** Same as JazzCash. |
| Card | Not built. A card gateway has not been chosen. |

## How a wallet payment works

1. Checkout (website or app) creates the orders as *waiting for payment* and holds the stock.
2. The API returns a signed start link (`/api/v1/payments/:id/go`) that expires in 30 minutes.
3. That link shows a tiny page that posts the payment form to the wallet's hosted page. The customer pays there; RUNG never sees their wallet PIN.
4. The wallet posts back to `/api/v1/payments/callback/jazzcash` or `/easypaisa`.
   - JazzCash: the reply's `pp_SecureHash` must match (HMAC-SHA256 with the integrity salt) and the merchant ID must be ours, or it is refused with 400 and written to the audit log.
   - Easypaisa: its return is not signed, so RUNG never trusts it. RUNG asks Easypaisa's inquiry API for the real status before doing anything.
5. `settlePayment` (apps/api/src/lib/payments.ts) is the only place that changes orders or bookings after a payment:
   - Paid: orders move to *placed* and the vendor's response timer starts; a booking advance confirms the booking.
   - Declined: orders are cancelled and the stock goes back.
   - Paid but a different amount than asked: nothing is placed; the payment waits for finance with a note.
   - Paid after the order was already cancelled: a refund request goes to finance.
   - The same reply arriving twice changes nothing the second time.
6. The customer lands on the result page (website `/payment/result`, app `payment-result`), which reads the status from the API. The app only returns to `rung://` or an address listed in `APP_RETURN_ORIGINS`.

Wallet refunds are done by finance from the merchant portal and recorded in the admin dashboard (no automatic wallet refund API is used).

## The local simulator

`PAYMENT_SIMULATOR=1` (ignored when `NODE_ENV=production`) serves fake JazzCash and Easypaisa pages at `/api/v1/sandbox-sim/*` with an Approve and a Decline button, signing their replies the way the code expects. The browser tests use it. **It only proves RUNG agrees with itself.** It does not prove that the real gateways use the same fields, codes or signatures.

## Where the field names came from

JazzCash's and Easypaisa's official integration guides are only given to merchants, and their sites refused automated reading. The field names, hash rules, response codes (JazzCash `000` paid, `124`/`157` waiting) and the Easypaisa inquiry call were taken from public merchant integration code. Every one of them must be checked against the official guide before going live.

## Go-live checklist (needs Minahil)

1. Register as a merchant with JazzCash and Easypaisa (needs company registration / NTN, business bank account, website policies). See `docs/ACCOUNTS_AND_KEYS.md`.
2. Put the **sandbox** credentials in the server environment (`.env.example` lists the names). Never in the code.
3. Set `PUBLIC_API_URL` to the deployed API address and give the callback URLs to each wallet's portal.
4. In each merchant sandbox, run and record: a successful payment, a declined payment, a cancelled payment, a voucher / pending payment, and a tampered callback. Compare the hash field list, amount format and response codes with the official guide and fix anything that differs.
5. Only after all of that passes, and only with Minahil's written go-ahead, switch `JAZZCASH_MODE` / `EASYPAISA_MODE` to `live`.
