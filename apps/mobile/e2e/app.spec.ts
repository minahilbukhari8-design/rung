import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { OUTBOX } from '../playwright.config';

function lastCode(e164: string): string {
  const lines = readFileSync(OUTBOX, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { to: string; text: string });
  return [...lines].reverse().find((l) => l.to === e164)!.text.match(/(\d{6})/)![1]!;
}

async function login(page: Page, local: string, e164: string) {
  await page.goto('/login');
  await page.getByLabel('Mobile number').fill(local);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').fill(await expect.poll(() => { try { return lastCode(e164); } catch { return ''; } }).not.toBe('').then(() => lastCode(e164)));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByLabel('6-digit code')).toHaveCount(0);
}

test('home shows occasions and DEMO listings; Urdu switch flips the app to RTL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Every celebration, one place' })).toBeVisible();
  await expect(page.getByTestId('product-demo-chocolate-cake')).toContainText('DEMO');
  await expect(page.getByTestId('service-demo-mehndi-decor')).toBeVisible();
  await page.getByRole('button', { name: 'اردو' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'ہر جشن، ایک جگہ' })).toBeVisible();
  await expect(page.getByTestId('product-demo-chocolate-cake')).toContainText('ڈیمو چاکلیٹ کیک');
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('Roman Urdu search finds the mehndi decor service', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('textbox', { name: 'Search' }).fill('mehendi');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByTestId('hit-demo-mehndi-decor')).toBeVisible();
});

test('customer logs in, orders a cake with test payment, then cancels and is refunded', async ({ page }) => {
  await login(page, '0333 4445555', '+923334445555');
  await page.goto('/product/demo-bakery/demo-chocolate-cake');
  await page.getByTestId('variant-1 lb').click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();

  await page.goto('/cart');
  await page.getByLabel('Recipient name').fill('Ammi');
  await page.getByLabel('Recipient phone').fill('03211234567');
  await page.getByLabel('House / street').fill('House 12, Street 4');
  await page.getByLabel('Area').fill('DHA');
  await page.getByRole('button', { name: 'Save address' }).click();
  await page.locator('[data-testid^="date-"]').nth(2).click();
  await page.locator('[data-testid^="slot-"]').first().click();
  await page.getByLabel('Your name (sender)').fill('Bilal');
  await expect(page.getByText('Total')).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();

  await expect(page.getByRole('heading', { name: 'Order placed' })).toBeVisible();
  await expect(page.getByText('Placed', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('refund')).toContainText('PROCESSED');

  await page.goto('/account');
  await expect(page.locator('[data-testid^="order-RG-"]').first()).toContainText('Cancelled');
});

test('customer requests a decor booking', async ({ page }) => {
  await login(page, '0333 4446666', '+923334446666');
  await page.goto('/service/demo-decor/demo-mehndi-decor');
  await expect(page.getByText('DEMO Basic')).toBeVisible();
  await page.getByLabel('Venue address').fill('Marquee 5, Main Boulevard');
  await page.getByLabel('Area').fill('Gulberg III');
  await page.getByLabel('Guests').fill('120');
  await page.getByRole('button', { name: 'Request booking' }).click();
  await expect(page.getByRole('heading', { name: /Booking requested/ })).toBeVisible();
  await expect(page.getByText('Requested', { exact: true }).first()).toBeVisible();
});

test('JazzCash (local simulator): the app sends the customer to the wallet and shows the confirmed result', async ({ page }) => {
  await login(page, '0333 4447777', '+923334447777');
  await page.goto('/product/demo-bakery/demo-chocolate-cake');
  await page.getByTestId('variant-1 lb').click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to cart')).toBeVisible();
  await page.goto('/cart');
  await page.getByLabel('Recipient name').fill('Khala');
  await page.getByLabel('Recipient phone').fill('03211239999');
  await page.getByLabel('House / street').fill('House 3, Street 9');
  await page.getByLabel('Area').fill('DHA');
  await page.getByRole('button', { name: 'Save address' }).click();
  await page.locator('[data-testid^="date-"]').nth(2).click();
  await page.locator('[data-testid^="slot-"]').first().click();
  await page.getByLabel('Your name (sender)').fill('Hina');
  await page.getByTestId('pay-JAZZCASH').click();
  await expect(page.getByText('Total')).toBeVisible();
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByRole('heading', { name: 'JazzCash (simulator)' })).toBeVisible();
  await page.getByRole('button', { name: 'Approve payment' }).click();
  await expect(page).toHaveURL(/\/payment-result\?payment=/);
  await expect(page.getByTestId('payment-result')).toContainText('Payment received. Thank you!');
  await page.getByRole('button', { name: 'View order' }).click();
  await expect(page.getByText('Placed', { exact: true }).first()).toBeVisible();
});

test('Ask RUNG from the home screen (basic helper, no AI key) finds a real DEMO cake and opens it', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('open-assistant').click();
  await expect(page.getByTestId('assistant-mode')).toContainText('not switched on yet');
  await page.getByLabel('Your message').fill('salgirah ke liye cake 1500 tak');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByTestId('chat-assistant')).toContainText('DEMO Chocolate Cake');
  await page.getByTestId('chat-card-demo-chocolate-cake').click();
  await expect(page).toHaveURL(/\/product\/demo-bakery\/demo-chocolate-cake/);
});
