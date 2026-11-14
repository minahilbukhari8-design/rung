import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { API, OUTBOX } from '../playwright.config';

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

/** A customer places a real (sandbox) order through the API so the vendor has something to act on. */
async function placeOrder(request: APIRequestContext, daysAhead: number): Promise<string> {
  const phone = '03215550001';
  await request.post(`${API}/api/v1/auth/otp/request`, { data: { phone } });
  const { accessToken } = await (await request.post(`${API}/api/v1/auth/otp/verify`, { data: { phone, code: lastCode('+923215550001') } })).json();
  const h = { authorization: `Bearer ${accessToken}` };
  const detail = await (await request.get(`${API}/api/v1/products/demo-bakery/demo-chocolate-cake`)).json();
  const variant = detail.variants.find((v: { name: string }) => v.name === '1 lb');
  const addr = await (await request.post(`${API}/api/v1/me/addresses`, { headers: h, data: { recipientName: 'Ammi', recipientPhone: '03211234567', line1: 'House 12, Street 4', area: 'DHA' } })).json();
  await request.post(`${API}/api/v1/cart/items`, { headers: h, data: { variantId: variant.id, quantity: 1 } });
  const date = new Date(Date.now() + 5 * 3600_000 + daysAhead * 86_400_000).toISOString().slice(0, 10);
  const co = await request.post(`${API}/api/v1/checkout`, { headers: h, data: { provider: 'MOCK', idempotencyKey: `vendor-e2e-${daysAhead}`, senderName: 'Bilal', groups: [{ vendorId: detail.vendor.id, addressId: addr.id, date, slotStartMinute: 900 }] } });
  expect(co.ok()).toBe(true);
  return (await co.json()).orders[0];
}

test('unknown login is redirected; a new seller applies and sees the review notice', async ({ page }) => {
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login$/);
  await login(page, '0333 7778888', '+923337778888');
  await expect(page.getByRole('heading', { name: 'Open your shop on RUNG' })).toBeVisible();
  await page.getByLabel('Shop name', { exact: true }).fill('Test Florist');
  await page.getByLabel(/Shop link/).fill('test-florist-e2e');
  await page.getByLabel(/Products \(cakes/).check();
  await page.getByLabel('Shop phone').fill('03337778888');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Your shop is under review')).toBeVisible();
  await expect(page.getByText('Under review', { exact: true })).toBeVisible();
});

test('DEMO bakery owner accepts an order and moves it to out for delivery', async ({ page, request }) => {
  const number = await placeOrder(request, 2);
  await login(page, '0300 0000101', '+923000000101');
  await expect(page.getByText('DEMO').first()).toBeVisible();
  const card = page.getByTestId(`order-${number}`);
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Accept' }).click();
  await page.goto('/orders?status=ACCEPTED');
  await page.getByTestId(`order-${number}`).getByRole('button', { name: 'Start preparing' }).click();
  await page.getByRole('tab', { name: 'Preparing' }).click();
  await page.getByTestId(`order-${number}`).getByRole('button', { name: 'Out for delivery' }).click();
  await page.getByRole('tab', { name: 'Out for delivery' }).click();
  await expect(page.getByTestId(`order-${number}`).getByLabel('Delivery photo')).toBeVisible();
});

test('owner adds a product as a draft, then publishes it', async ({ page }) => {
  await login(page, '0300 0000101', '+923000000101');
  await page.goto('/catalogue');
  await page.getByText('Add product').click();
  const form = page.locator('details', { hasText: 'Add product' });
  await form.getByLabel('Title', { exact: true }).fill('Rose Cupcakes Box');
  await form.getByLabel('Category').selectOption({ index: 1 });
  await form.getByLabel('Option name').fill('Box of 6');
  await form.getByLabel('Price (Rs)').fill('1800');
  await form.getByRole('button', { name: 'Save' }).click();
  const card = page.getByTestId('product-rose-cupcakes-box');
  await expect(card.getByText('Draft')).toBeVisible();
  await card.getByRole('button', { name: 'Publish' }).click();
  await expect(card.getByText('Live')).toBeVisible();
});

test('Urdu switch flips the dashboard to RTL', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'لاگ ان' })).toBeVisible();
});
