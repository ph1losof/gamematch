/**
 * UI units are what people say in a meeting: percentages 0–100 and dollars. The model works in
 * fractions and integer micros. adapt.ts uses these to turn inputs into a Scenario; the charts
 * use toUsd for their dollar axes (and multiply back by 1e6 where a formatter wants micros).
 */
import { type Micros, usd } from '../src/shared/money';

export const fromPct = (pct: number) => pct / 100;
export const toPct = (fraction: number) => Math.round(fraction * 100 * 1e6) / 1e6;
export const fromUsd = (dollars: number): Micros => usd(dollars);
export const toUsd = (micros: Micros) => micros / 1_000_000;
