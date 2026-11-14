/** PKR money helpers. All amounts are integer paisa (Rs 1 = 100 paisa). */

export type Paisa = number;
export const BPS_DENOMINATOR = 10_000;

export function assertPaisa(value: number, label = 'amount'): asserts value is Paisa {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of paisa, got ${value}`);
  }
}

export function rupeesToPaisa(rupees: number): Paisa {
  const p = Math.round(rupees * 100);
  assertPaisa(p, 'rupees');
  return p;
}

/** Percentage (basis points) of an amount, rounded half-up to whole paisa. */
export function applyBps(amount: Paisa, bps: number): Paisa {
  assertPaisa(amount);
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_DENOMINATOR) throw new RangeError(`bps out of range: ${bps}`);
  return Math.floor((amount * bps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export function sumPaisa(values: Paisa[]): Paisa {
  const total = values.reduce((a, b) => {
    assertPaisa(b);
    return a + b;
  }, 0);
  assertPaisa(total, 'total');
  return total;
}

/** Display: "Rs 2,500" / "2,500 روپے". Paisa shown only when non-zero. Western digits in both locales. */
export function formatPKR(amount: Paisa, locale: 'en' | 'ur' = 'en'): string {
  assertPaisa(amount);
  const rupees = Math.floor(amount / 100);
  const paisa = amount % 100;
  const n = rupees.toLocaleString('en-US') + (paisa ? '.' + String(paisa).padStart(2, '0') : '');
  return locale === 'ur' ? `${n} روپے` : `Rs ${n}`;
}
