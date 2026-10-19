/**
 * Formatters for model figures. Model money arrives in micros and rates as fractions; every
 * figure on screen goes through here so non-finite values read "—" instead of NaN or Infinity, a value that rounds to
 * zero never shows a minus sign, and a projector shows the same rounding everywhere.
 */
import type { Micros } from '../src/shared/money';
import { toUsd } from './units';

const ok = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const DASH = '—';

/** Dollars from micros: $2.97, −$12.03, $1.2M with `compact`. */
export function money(micros: Micros | null | undefined, digits = 2, compact = false): string {
  if (!ok(micros)) return DASH;
  const d = toUsd(micros);
  const minus = d < 0 && Number(Math.abs(d).toFixed(digits)) > 0 ? '−' : '';
  if (compact && Math.abs(d) >= 10_000) return `${minus}$${compactNum(Math.abs(d))}`;
  return `${minus}$${Math.abs(d).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Signed money: +$1.20 / −$3.40 (and +$0.00, never −$0.00). */
export function signedMoney(
  micros: Micros | null | undefined,
  digits = 2,
  compact = false,
): string {
  const m = money(micros, digits, compact);
  return m === DASH || m.startsWith('−') ? m : `+${m}`;
}

/** A price per 1,000: "$17" when whole dollars (as typed), else "$3.39". */
export const cpm = (micros: Micros | null | undefined) =>
  money(micros, ok(micros) && micros % 1_000_000 === 0 ? 0 : 2);

/** A fraction as a percentage. */
export function pct(fraction: number | null | undefined, digits = 1): string {
  if (!ok(fraction)) return DASH;
  const s = (fraction * 100).toFixed(digits);
  return `${Number(s) === 0 ? (0).toFixed(digits) : s}%`;
}

export function compactNum(x: number | null | undefined): string {
  if (!ok(x)) return DASH;
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: Math.abs(x) < 10 ? 2 : 1,
    signDisplay: 'negative',
  }).format(x);
}

/** A fraction as a percentage with 1 decimal below 10% and none above: 4.9%, 63%. */
export const pctAuto = (fraction: number | null | undefined) =>
  pct(fraction, ok(fraction) && Math.abs(fraction) < 0.1 ? 1 : 0);
