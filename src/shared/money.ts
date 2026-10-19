/** All money is integer micro-dollars (1 USD = 1_000_000), so no float ever touches a balance. */
export type Micros = number;

export const usd = (dollars: number): Micros => Math.round(dollars * 1_000_000);

export const fmtUsd = (micros: Micros): string =>
  (micros / 1_000_000).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
