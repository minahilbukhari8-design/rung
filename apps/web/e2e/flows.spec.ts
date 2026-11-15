import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { OUTBOX } from '../playwright.config';

function lastCode(e164: string): string {
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string });
  const m = [...lines].reverse().find((l) => l.to === e164)!;
  return m.text.match(/(\d{6})/)![1]!;
}

async function login(page: Page, local: string, e164: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').waitFor();
  await page.getByLabel('6-digit code').fill(lastCode(e164));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('link', { name: 'My orders' })).toBeVisible();
}

test('home shows occasions and DEMO listings; Urdu switch flips to RTL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every celebration, one place' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Birthday/ })).toBeVisible();
  await expect(page.getByText('DEMO').first()).toBeVisible();
  await page.getByRole('link', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'ہر جشن، ایک جگہ' })).toBeVisible();
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('Roman Urdu search finds the mehndi service', async ({ page }) => {
  await page.goto('/search?q=mehendi');
  await expect(page.getByRole('link', { name: 'DEMO Mehndi Stage Decor' })).toBeVisible();
});

test('customer orders a cake for someone else and tracks it', async ({ page, context }) => {
  await login(page, '0333 1234567', '+923331234567');
  // tokens are httpOnly cookies, not readable by page scripts
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'rung_at')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('rung_at');

  await page.goto('/products/demo-bakery/demo-chocolate-cake');
  await page.getByLabel(/2 lb/).check();
  await page.getByLabel(/Message on cake/).fill('Happy 60th Ammi');
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/cart');
  // first-time customers see the address form already open
  await expect(page.getByLabel('Recipient name')).toBeVisible();
  await page.getByLabel('Recipient name').fill('Ammi');
  await page.getByLabel('Recipient phone').fill('03211234567');
  await page.getByLabel('House / street').fill('House 12, Street 4');
  await page.getByLabel('Area').fill('Gulberg III');
  await page.getByRole('button', { name: 'Save address' }).click();
  await page.getByLabel('Your name (sender)').fill('Bilal');
  await page.getByLabel('Test payment (sandbox, no real money)').check();
  await expect(page.getByTestId('grand-total')).toHaveText('Rs 2,000');
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByText('Order placed ✓')).toBeVisible();
  await expect(page.getByTestId('order-status')).toHaveText('Placed, waiting for vendor');
  await expect(page.getByText(/Ammi, House 12, Street 4, Gulberg III/)).toBeVisible();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Cancelled');
  await expect(page.getByText(/Refund: Rs 2,000 \(PROCESSED\)/)).toBeVisible();
});

test('customer requests a decor booking', async ({ page }) => {
  await login(page, '0334 7654321', '+923347654321');
  await page.goto('/services/demo-decor/demo-mehndi-decor');
  const d = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('Event date and time').fill(d);
  await page.getByLabel('Venue address').fill('Lawn, House 3, Street 7');
  await page.getByLabel('Area').fill('DHA');
  await page.getByLabel('Guests').fill('120');
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page.getByTestId('booking-status')).toHaveText('Requested, waiting for vendor');
  await expect(page.getByText('Rs 3,000').first()).toBeVisible(); // 30% advance of DEMO Rs 10,000
});

test('protected pages send logged-out users to login', async ({ page }) => {
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login\?next=%2Forders|\/login\?next=\/orders/);
});

async function cartWithCake(page: Page) {
  await page.goto('/products/demo-bakery/demo-chocolate-cake');
  await page.getByLabel(/1 lb/).check();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  await page.goto('/cart');
  await page.getByLabel('Recipient name').fill('Apa');
  await page.getByLabel('Recipient phone').fill('03211230000');
  await page.getByLabel('House / street').fill('House 7, Street 2');
  await page.getByLabel('Area').fill('DHA');
  await page.getByRole('button', { name: 'Save address' }).click();
  await page.getByLabel('Your name (sender)').fill('Sara');
}

test('JazzCash (local simulator): approve on the wallet page → back on RUNG, order placed', async ({ page }) => {
  await login(page, '0335 1110001', '+923351110001');
  await cartWithCake(page);
  await page.getByLabel(/JazzCash wallet \(sandbox/).check();
  await expect(page.getByTestId('grand-total')).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  // the browser is now on the (simulated) JazzCash page, reached through a signed, auto-posting form
  await expect(page.getByRole('heading', { name: 'JazzCash (simulator)' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve payment' }).click();
  await expect(page).toHaveURL(/\/payment\/result\?payment=/);
  await expect(page.getByTestId('payment-result')).toHaveText('Payment received. Thank you!');
  await page.getByRole('link', { name: /View order RG-/ }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Placed, waiting for vendor');
});

test('Easypaisa (local simulator): declining cancels the order and says no money was taken', async ({ page }) => {
  await login(page, '0335 1110002', '+923351110002');
  await cartWithCake(page);
  await page.getByLabel(/Easypaisa wallet \(sandbox/).check();
  await expect(page.getByTestId('grand-total')).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: 'Easypaisa (simulator)' })).toBeVisible();
  await page.getByRole('button', { name: 'Decline' }).click();
  await expect(page).toHaveURL(/\/payment\/result\?payment=/);
  await expect(page.getByTestId('payment-result')).toHaveText('The payment did not go through. You have not been charged by RUNG.');
  await page.getByRole('link', { name: /View order RG-/ }).click();
  await expect(page.getByTestId('order-status')).toHaveText('Cancelled');
});

test('Ask RUNG (basic helper, no AI key): Roman Urdu request shows real DEMO listings with working links', async ({ page }) => {
  await page.goto('/assistant');
  await expect(page.getByTestId('assistant-mode')).toContainText('not switched on yet');
  await page.getByLabel('Your message').fill('mehendi ke liye sajawat chahiye');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('chat-assistant')).toContainText('DEMO Mehndi Stage Decor');
  await page.getByTestId('chat-card-demo-mehndi-decor').click();
  await expect(page).toHaveURL(/\/services\/demo-decor\/demo-mehndi-decor/);
});

/** WCAG 2.1 A/AA checks with axe-core on each page; any violation fails the test with its rule, element and fix hint. */
async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = r.violations.map((v) => `${path} ${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(problems, problems.join('\n')).toEqual([]);
}

test('accessibility (axe, WCAG 2.1 AA): public pages in English and Urdu, and logged-in pages', async ({ page }) => {
  for (const p of ['/', '/products', '/services', '/search?q=cake', '/products/demo-bakery/demo-chocolate-cake', '/services/demo-decor/demo-mehndi-decor', '/occasions/birthday', '/vendors/demo-bakery', '/assistant', '/login']) await expectAccessible(page, p);
  await page.goto('/');
  await page.getByRole('link', { name: 'اردو' }).click();
  for (const p of ['/', '/products/demo-bakery/demo-chocolate-cake', '/services/demo-decor/demo-mehndi-decor']) await expectAccessible(page, p);
  await page.getByRole('link', { name: 'English' }).click();
  await login(page, '0335 1110003', '+923351110003');
  for (const p of ['/cart', '/orders', '/bookings']) await expectAccessible(page, p);
});
