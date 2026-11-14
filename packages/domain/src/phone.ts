/**
 * Pakistani mobile number normalisation to E.164 (+923XXXXXXXXX).
 * Accepts 03001234567, 3001234567, 923001234567, +92 300 1234567, 0092-300-1234567.
 * Mobile numbers in Pakistan are 3XX-XXXXXXX (10 digits after the country code, starting with 3).
 */
export function normalizePkMobile(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  let rest: string;
  if (/^\+92\d+$/.test(digits)) rest = digits.slice(3);
  else if (/^0092\d+$/.test(digits)) rest = digits.slice(4);
  else if (/^92\d{10}$/.test(digits)) rest = digits.slice(2);
  else if (/^0\d{10}$/.test(digits)) rest = digits.slice(1);
  else if (/^\d{10}$/.test(digits)) rest = digits;
  else return null;
  return /^3\d{9}$/.test(rest) ? `+92${rest}` : null;
}
