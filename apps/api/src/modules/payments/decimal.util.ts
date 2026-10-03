/**
 * Exact decimal helpers for crypto money math — NEVER floats.
 * All amounts flow as strings; comparisons/arith via BigInt with a fixed 8-dp scale.
 */
const SCALE = 8n;
const UNIT = 10n ** SCALE;

export function toBase(amount: string | number): bigint {
  const s = String(amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`bad decimal: ${s}`);
  const neg = s.startsWith('-');
  const [int, frac = ''] = (neg ? s.slice(1) : s).split('.');
  const scaled = BigInt(int || '0') * UNIT + BigInt((frac + '0'.repeat(8)).slice(0, 8));
  return neg ? -scaled : scaled;
}

export function fromBase(base: bigint): string {
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const int = abs / UNIT;
  const frac = (abs % UNIT).toString().padStart(8, '0').replace(/0+$/, '');
  return `${neg ? '-' : ''}${int}${frac ? '.' + frac : ''}`;
}

/** divide USD amount by rate → crypto amount, rounded UP to 8dp so we're never short-paid by rounding. */
export function divRoundUp(usd: string | number, rate: string | number): string {
  const num = toBase(usd); // usd has ≤2dp but safe at 8
  const r = toBase(rate);
  const q = (num * UNIT + r - 1n) / r; // ceil(num/r) at scale 8
  return fromBase(q);
}

export const cmp = (a: string, b: string): number => (toBase(a) === toBase(b) ? 0 : toBase(a) > toBase(b) ? 1 : -1);
export const sub = (a: string, b: string): string => fromBase(toBase(a) - toBase(b));
export const add = (a: string, b: string): string => fromBase(toBase(a) + toBase(b));
export const gte = (a: string, b: string): boolean => toBase(a) >= toBase(b);
