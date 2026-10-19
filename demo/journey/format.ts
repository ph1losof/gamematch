/** Formatting the page's panels and phone screens share (browser side); escaping is html.ts's `esc`. */

/** Micro-dollars: cents, or four decimals for sub-cent amounts like one impression. */
export const usd = (m: number) => {
  const d = m / 1e6;
  const digits = m !== 0 && m % 10_000 !== 0 ? 4 : 2;
  const amount = Math.abs(d).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${d < 0 ? '−' : ''}$${amount}`;
};

/** Shortens generated IDs (`clk_1a2b3c…`) inside URLs and account names. */
export const shortIds = (s: string) => s.replace(/\b([a-z]{2,5}_[0-9a-f]{6})[0-9a-f]{20,}/g, '$1…');
