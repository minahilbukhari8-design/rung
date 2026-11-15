import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API, OUTBOX } from '../playwright.config';

const ADMIN = { local: '0300 9990000', e164: '+923009990000' };

function lastCode(e164: string): string {
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string });
  return [...lines].reverse().find((l) => l.to === e164)!.text.match(/(\d{6})/)![1]!;
}

async function login(page: Page, local: string, e164: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  await page.getByLabel('6-digit code').fill(lastCode(e164));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

async function apiLogin(request: APIRequestContext, phone: string, e164: string) {
  await request.post(`${API}/api/v1/auth/otp/request`, { data: { phone } });
  const { accessToken } = await (await request.post(`${API}/api/v1/auth/otp/verify`, { data: { phone, code: lastCode(e164) } })).json();
  return { authorization: `Bearer ${accessToken}` };
}

/** A customer pays for a cake by bank transfer: the order waits for an admin to confirm the money arrived. */
async function bankTransferOrder(request: APIRequestContext) {
  const h = await apiLogin(request, '03215550002', '+923215550002');
  const detail = await (await request.get(`${API}/api/v1/products/demo-bakery/demo-chocolate-cake`)).json();
  const variant = detail.variants.find((v: { name: string }) => v.name === '1 lb');
  const addr = await (await request.post(`${API}/api/v1/me/addresses`, { headers: h, data: { recipientName: 'Ammi', recipientPhone: '03211234567', line1: 'House 12, Street 4', area: 'DHA' } })).json();
  await request.post(`${API}/api/v1/cart/items`, { headers: h, data: { variantId: variant.id, quantity: 1 } });
  const date = new Date(Date.now() + 5 * 3600_000 + 3 * 86_400_000).toISOString().slice(0, 10);
  const co = await (await request.post(`${API}/api/v1/checkout`, { headers: h, data: { provider: 'BANK_TRANSFER', idempotencyKey: 'admin-e2e-bt-1', senderName: 'Bilal', groups: [{ vendorId: detail.vendor.id, addressId: addr.id, date, slotStartMinute: 900 }] } })).json();
  return { number: co.orders[0] as string, paymentId: co.payment.id as string };
}

test('logged-out visitors go to login; non-admins are told they have no access', async ({ page }) => {
  await page.goto('/payments');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, '0333 1112222', '+923331112222');
  await expect(page.getByText('This account is not a RUNG admin')).toBeVisible();
});

test('admin reviews KYC and approves a new shop', async ({ page, request }) => {
  // a seller applies and uploads the front of their CNIC (a tiny test PDF)
  const h = await apiLogin(request, '03345556666', '+923345556666');
  await request.post(`${API}/api/v1/vendor/apply`, { headers: h, data: { slug: 'e2e-test-florist', name: 'E2E Test Florist', kind: 'PRODUCTS', phone: '03345556666' } });
  const up = await (await request.post(`${API}/api/v1/uploads`, { headers: h, data: { purpose: 'KYC', contentType: 'application/pdf', dataBase64: Buffer.from('%PDF-1.4\n%test\n').toString('base64') } })).json();
  await request.post(`${API}/api/v1/vendor/documents`, { headers: h, data: { type: 'CNIC_FRONT', key: up.key } });

  await login(page, ADMIN.local, ADMIN.e164);
  await expect(page.getByRole('link', { name: /Shops to review/ })).toContainText('1');

  await page.goto('/documents');
  const doc = page.locator('[data-testid^="doc-"]', { hasText: 'E2E Test Florist' });
  // the private file opens for an admin through the dashboard
  const href = await doc.getByRole('link', { name: 'Open file' }).getAttribute('href');
  const file = await page.request.get(href!);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toBe('application/pdf');
  await doc.getByRole('button', { name: 'Accept' }).click();
  await expect(doc).toHaveCount(0);

  await page.goto('/vendors');
  const card = page.getByTestId('vendor-e2e-test-florist');
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(card.getByText('Cnic front')).toBeVisible();
  await card.getByRole('button', { name: 'Approve shop' }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Approved' }).click();
  await expect(page.getByTestId('vendor-e2e-test-florist')).toBeVisible();
});

test('finance confirms a bank transfer, support cancels the order, finance records the refund', async ({ page, request }) => {
  const { number, paymentId } = await bankTransferOrder(request);
  await login(page, ADMIN.local, ADMIN.e164);

  await page.goto('/payments');
  const row = page.getByTestId(`payment-${paymentId}`);
  await row.getByRole('button', { name: 'Confirm received' }).click();
  await row.getByLabel('Bank reference').fill('TEST-IBFT-0001');
  await row.getByRole('button', { name: 'Confirm received' }).click();
  await expect(row).toHaveCount(0);

  await page.goto('/orders?status=PLACED');
  const card = page.getByTestId(`order-${number}`);
  await expect(card).toContainText('Placed');
  await card.getByRole('button', { name: 'Details' }).click();
  await expect(card).toContainText('Bank transfer');
  await card.getByRole('button', { name: 'Cancel order' }).click();
  await card.getByLabel(/Reason/).fill('Customer called to cancel');
  await card.getByRole('button', { name: 'Cancel order' }).click();
  // it leaves the "Placed" list and shows under Cancelled
  await expect(card).toHaveCount(0);
  await page.getByRole('tab', { name: 'Cancelled' }).click();
  await expect(page.getByTestId(`order-${number}`)).toContainText('Cancelled');

  await page.goto('/refunds');
  const refund = page.locator('[data-testid^="refund-"]', { hasText: number });
  await refund.getByRole('button', { name: 'Mark sent' }).click();
  await refund.getByLabel('Transfer reference').fill('TEST-REFUND-0001');
  await refund.getByRole('button', { name: 'Mark sent' }).click();
  await expect(refund).toHaveCount(0);

  await page.goto('/audit');
  await expect(page.getByRole('cell', { name: 'refund.mark-paid' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'payment.confirm' })).toBeVisible();
});

test('support blocks and unblocks a user', async ({ page }) => {
  await login(page, ADMIN.local, ADMIN.e164);
  await page.goto('/users');
  await page.getByLabel('Search users').fill('3331112222');
  await page.getByRole('button', { name: 'Search' }).click();
  const row = page.getByTestId('user-+923331112222');
  await row.getByRole('button', { name: 'Block' }).click();
  await row.getByLabel('Reason').fill('Test block');
  await row.getByRole('button', { name: 'Block' }).click();
  await expect(row).toContainText('Blocked');
  await row.getByRole('button', { name: 'Unblock' }).click();
  await expect(row).not.toContainText('Blocked');
});
