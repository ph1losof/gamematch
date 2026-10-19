/**
 * Small numeric helpers for the dashboard's curves: grids, a grid-then-refine argmax (the bid
 * curve has a kink where the frequency cap binds, so no derivative-based search) and tornado
 * ordering. Domain-free on purpose: scenario.ts decides what to sweep.
 */

export const linspace = (lo: number, hi: number, n: number): number[] =>
  n < 2 ? [lo] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));

export const logspace = (lo: number, hi: number, n: number): number[] =>
  linspace(Math.log10(lo), Math.log10(hi), n).map((e) => 10 ** e);

/** Maximise fn on [lo, hi]: a coarse grid, then `refine` finer grids around the best point. */
export function argmaxOnGrid(
  fn: (x: number) => number,
  lo: number,
  hi: number,
  n = 200,
  refine = 2,
) {
  let best = { x: lo, y: fn(lo) };
  let [a, b] = [lo, hi];
  for (let pass = 0; pass <= refine; pass++) {
    const step = (b - a) / (n - 1);
    for (const x of linspace(a, b, n)) {
      const y = fn(x);
      if (y > best.y) best = { x, y };
    }
    [a, b] = [Math.max(lo, best.x - step), Math.min(hi, best.x + step)];
  }
  return best;
}

export type TornadoBar = {
  key: string;
  label: string;
  lowText: string;
  highText: string;
  low: number;
  high: number;
  lowDelta: number; // low − base, so the chart can draw bars from the base line
  highDelta: number;
  swing: number;
};

/** Bars sorted by swing, largest first; inputs that don't move the metric are dropped. */
export const tornadoOrder = (
  base: number,
  bars: Omit<TornadoBar, 'swing' | 'lowDelta' | 'highDelta'>[],
  limit = 12,
): TornadoBar[] =>
  bars
    .flatMap((b) => {
      const swing = Math.abs(b.high - b.low);
      return Number.isFinite(swing) && swing > 1e-6
        ? [{ ...b, lowDelta: b.low - base, highDelta: b.high - base, swing }]
        : [];
    })
    .sort((x, y) => y.swing - x.swing)
    .slice(0, limit);
